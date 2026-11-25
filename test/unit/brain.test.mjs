// The home base's brain (v7.6, SPEC §24): the pure helpers (src/lib/brain.js: the Core's answers
// checked, failures worded, deep links, the chat commands and what the chat shows), the client
// (src/platform/brain.js, with a fake fetch), the controller (src/ui/brain.js, with a fake client)
// and the service worker's push and notification handlers (public/sw.js in a VM).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  brainView,
  jobView,
  watcherView,
  briefingView,
  spendDaysView,
  brainProblem,
  parseHomeBaseLink,
  homeBaseLinkOf,
  matchBrainCommand,
  briefingFallback,
  briefingMarkdown,
  briefingSpeech,
  resultsMarkdown,
  resultsSpeech,
  weatherLine,
  roundCoord,
  formatUsd,
  deviceLabel,
  shouldShowMorning,
  isFreshBriefing,
  safeUrl,
  appleMusicUrl,
  OLD_CORE_MESSAGE,
} from '../../src/lib/brain.js';
import { matchHomeBaseCommand } from '../../src/lib/homebase.js';
import * as client from '../../src/platform/brain.js';
import { createBrain } from '../../src/ui/brain.js';
import { markdownToPlainText } from '../../src/lib/markdown.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRIEFING = JSON.parse(readFileSync(path.join(ROOT, 'test', 'unit', 'fixtures', 'brain', 'briefing.json'), 'utf8'));
const BASE = 'https://alienware.tail4e5f6a.ts.net/';
const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';

const BRAIN = {
  version: '1.1.0',
  key: { set: true, hint: '…Ab3D', setAt: '2026-11-25T06:00:00Z', verified: true },
  sdk: { installed: true },
  limits: { dailyUsd: 5, monthlyUsd: 50 },
  spend: { day: '2026-11-25', todayUsd: 0.42, month: '2026-11', monthUsd: 3.1, capReached: null },
  push: { vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', devices: [{ id: 'p_1', label: 'iPhone', addedAt: '2026-11-25T06:00:00Z' }] },
  briefing: { enabled: true, time: '07:00', units: 'F', location: { label: 'Your location', lat: 51.51, lon: -0.13 }, lastAt: null, nextAt: '2026-11-25T12:00:00Z' },
  jobs: { running: 0, queued: 0 },
  watchers: { active: 2 },
  owner: { name: 'Frank' },
};

// ---- the Core's answers, checked ---------------------------------------------------------------

test('brain view: the Core’s GET api/brain checked field by field; a missing number is null, never 0', () => {
  const v = brainView(BRAIN);
  assert.equal(v.version, '1.1.0');
  assert.deepEqual(v.key, { set: true, hint: '…Ab3D', setAt: Date.parse('2026-11-25T06:00:00Z'), verified: true });
  assert.deepEqual(v.limits, { dailyUsd: 5, monthlyUsd: 50 });
  assert.equal(v.spend.capReached, null);
  assert.equal(v.push.vapidPublicKey.length, 87);
  assert.deepEqual(v.briefing.location, { label: 'Your location', lat: 51.51, lon: -0.13 });
  assert.equal(v.watchers.active, 2);
  const partial = brainView({ version: '1.1.0', limits: {} });
  assert.deepEqual(partial.limits, { dailyUsd: null, monthlyUsd: null });
  assert.equal(partial.spend.todayUsd, null);
  assert.equal(partial.key.set, false);
  assert.equal(partial.briefing.time, '07:00');
  assert.equal(brainView({ error: 'not_found' }), null, 'not a brain answer');
  assert.equal(brainView(null), null);
});

test('brain view: a "hint" that is really a key (or anything long) is never shown', () => {
  for (const hint of [KEY, 'sk-ant-api03-abcdefghij', '…ABCDEFGHIJK', '<b>x</b>']) {
    assert.equal(brainView({ ...BRAIN, key: { set: true, hint } }).key.hint, '', hint);
  }
  assert.equal(brainView({ ...BRAIN, key: { set: true, hint: 'Ab3D' } }).key.hint, '…Ab3D');
  assert.equal(brainView({ ...BRAIN, key: { set: false, hint: '…Ab3D' } }).key.hint, '', 'no key: no hint');
  assert.equal(brainView({ ...BRAIN, push: { vapidPublicKey: 'not a key!' } }).push.vapidPublicKey, '');
});

test('jobs, watchers and spend: statuses worded, sources kept to http(s), duplicates dropped', () => {
  const j = jobView({
    id: 'j_1',
    kind: 'research',
    title: '',
    prompt: 'Best espresso machines under $500',
    depth: 'deep',
    status: 'done',
    createdAt: '2026-11-25T05:00:00Z',
    finishedAt: '2026-11-25T05:10:00Z',
    costUsd: 0.84,
    summary: 'The Bambino Plus.',
    error: null,
    result: { markdown: '## Hi', sources: [{ title: 'A', url: 'https://a.example/x' }, { title: 'dup', url: 'https://a.example/x' }, { title: 'js', url: 'javascript:alert(1)' }, { title: '', url: 'https://b.example/' }, { url: 'data:text/html,x' }] },
  });
  assert.equal(j.title, 'Best espresso machines under $500', 'no title: the prompt');
  assert.equal(j.statusWord, 'Done');
  assert.equal(j.active, false);
  assert.deepEqual(j.result.sources, [{ title: 'A', url: 'https://a.example/x' }, { title: 'b.example', url: 'https://b.example/' }]);
  assert.equal(jobView({ id: 'j_2', status: 'running' }).active, true);
  assert.equal(jobView({ id: 'j_3', status: 'weird' }).status, 'queued');
  assert.equal(jobView({ id: '../x', status: 'done' }), null, 'an id that could leave api/jobs/');
  const w = watcherView({ id: 'w_1', what: 'the LG 27GP850 drops under $300', every: '12h', status: 'met', lastResult: { met: true, summary: 'Now $289', sources: [{ title: 'Shop', url: 'https://shop.example/lg' }] } });
  assert.equal(w.statusWord, 'It happened');
  assert.equal(w.lastResult.met, true);
  assert.equal(watcherView({ id: 'w_2', every: '1m' }).every, '24h');
  const s = spendDaysView({ days: [{ day: '2026-11-24', usd: 1.25, calls: 9 }, { day: '2026-11-25', usd: 0.42, calls: 3 }, { day: 'bad', usd: 1 }], month: { month: '2026-11', usd: 3.1 } });
  assert.deepEqual(s.days.map((d) => d.day), ['2026-11-25', '2026-11-24'], 'newest first, bad rows dropped');
});

test('briefing view: links only from checked addresses, music only from Apple Music, the weather in one line', () => {
  const v = briefingView(BRIEFING);
  assert.equal(v.greeting, 'Good morning, Tony.');
  assert.equal(v.headlines.length, 4);
  assert.equal(v.headlines[3].url, '', 'a javascript: headline keeps its words, not its link');
  assert.equal(v.music.url, 'https://music.apple.com/us/album/back-in-black/574050396?i=574050602');
  assert.equal(briefingView({ ...BRIEFING, music: { suggestion: 'x', appleMusicUrl: 'https://evil.example/music' } }).music.url, '');
  assert.equal(weatherLine(v.weather), '41°F, partly cloudy · high 52°, low 38° · 20% chance of rain');
  assert.equal(weatherLine({ units: 'C', temp: 5.4, now: '', high: null, low: null, rainChancePct: null }), '5°C');
  assert.equal(briefingView({ nothing: true }), null);
  assert.equal(safeUrl('https://user:pw@x.example/'), '', 'no credentials in a link');
  assert.equal(appleMusicUrl('http://music.apple.com/x'), '', 'https only');
});

test('briefing in the chat: the Core’s words escaped (no link, no HTML from them), headlines linked from checked addresses', () => {
  const md = briefingMarkdown(briefingView(BRIEFING));
  assert.match(md, /\[Markets open higher as chip stocks rally\]\(https:\/\/news\.example\.com\/markets\)/);
  assert.doesNotMatch(md, /\]\(javascript:/i, 'no javascript: link');
  assert.doesNotMatch(md, /<script>/, 'the tag is escaped');
  const plain = markdownToPlainText(md);
  assert.match(plain, /<script>alert\(1\)<\/script> \[click\]\(javascript:alert\(2\)\)/, 'it reads as the plain words');
  assert.match(plain, /41°F, partly cloudy/);
  assert.match(plain, /All systems normal overnight/);
  assert.match(plain, /Best espresso machines under \$500/);
  assert.equal(briefingSpeech(briefingView(BRIEFING)), BRIEFING.spoken, 'the Core’s own spoken text');
  const noSpoken = briefingSpeech(briefingView({ ...BRIEFING, spoken: '' }));
  assert.match(noSpoken, /^Good morning, Tony\. It’s 41 degrees and partly cloudy, with a high of 52\./);
});

test('results in the chat: finished research newest first; nothing yet; still going', () => {
  const jobs = [
    jobView({ id: 'j_a', status: 'done', title: 'Older', summary: 'one', finishedAt: '2026-11-24T05:00:00Z' }),
    jobView({ id: 'j_b', status: 'done', title: 'Newer [x](javascript:1)', summary: 'two', finishedAt: '2026-11-25T05:00:00Z' }),
    jobView({ id: 'j_c', status: 'running', title: 'Going' }),
  ];
  const md = resultsMarkdown(jobs);
  assert.ok(md.indexOf('Newer') < md.indexOf('Older'), 'newest first');
  assert.doesNotMatch(md, /\]\(javascript/);
  assert.match(markdownToPlainText(md), /One more is still going/);
  assert.match(resultsMarkdown([]), /hasn’t finished any research yet/);
  assert.match(resultsMarkdown([jobs[2]]), /Nothing has finished yet/);
  assert.match(resultsSpeech(jobs), /^The home base finished 2 pieces of research\. The latest: Newer/);
});

test('failures: a 1.0 Core (404 not_found), no key (409), over the limit (402), a bad key, no briefing yet, unreachable', () => {
  assert.deepEqual(brainProblem({ ok: false, kind: 'http', status: 404, code: 'not_found' }), { state: 'old', message: OLD_CORE_MESSAGE });
  assert.equal(brainProblem({ ok: false, kind: 'http', status: 409, code: 'no_key' }).state, 'nokey');
  const cap = brainProblem({ ok: false, kind: 'http', status: 402, code: 'spend_cap' }, { limits: { dailyUsd: 5 } });
  assert.equal(cap.state, 'cap');
  assert.match(cap.message, /\(\$5\.00 a day\)/);
  assert.equal(brainProblem({ ok: false, kind: 'http', status: 400, code: 'bad_key' }).state, 'badkey');
  assert.equal(brainProblem({ ok: false, kind: 'http', status: 404, code: 'none_yet' }).state, 'none');
  assert.equal(brainProblem({ ok: false, kind: 'unreachable' }).state, 'offline');
  assert.equal(brainProblem({ ok: false, kind: 'down' }).state, 'offline');
  assert.match(brainProblem({ ok: false, kind: 'http', status: 500, message: 'boom' }).message, /error \(500\): boom/);
  // The Core's own words for its other refusals.
  assert.deepEqual(brainProblem({ ok: false, kind: 'http', status: 400, code: 'city_not_found', message: 'I couldn’t find a place called "Nowhere".' }), { state: 'said', message: 'I couldn’t find a place called "Nowhere".' });
  assert.equal(brainProblem({ ok: false, kind: 'http', status: 503, code: 'sdk_missing', message: 'the Claude SDK is not installed' }).message, 'The Claude SDK is not installed');
});

test('little helpers: coordinates to 2 decimals, dollars, the device’s name', () => {
  assert.equal(roundCoord(51.50735), 51.51);
  assert.equal(roundCoord(-0.12776), -0.13);
  assert.equal(roundCoord('x'), null);
  assert.deepEqual([formatUsd(0.42), formatUsd(3.1), formatUsd(50), formatUsd(5), formatUsd(null)], ['$0.42', '$3.10', '$50', '$5.00', '—']);
  assert.equal(deviceLabel('ios'), 'iPhone');
  assert.equal(deviceLabel('mac'), 'Mac');
});

test('the morning card: a briefing not yet seen, made in the last 14 hours; "brief me" reuses one under 3 hours old', () => {
  const now = Date.parse('2026-11-25T12:30:00Z');
  const v = briefingView({ ...BRIEFING, generatedAt: '2026-11-25T12:00:00Z' });
  assert.equal(shouldShowMorning(v, 0, now), true);
  assert.equal(shouldShowMorning(v, v.generatedAt, now), false, 'seen');
  assert.equal(shouldShowMorning(v, 0, now + 15 * 3600000), false, 'too old');
  assert.equal(isFreshBriefing(v, now), true);
  assert.equal(isFreshBriefing(v, now + 4 * 3600000), false);
});

// ---- deep links and chat commands ------------------------------------------------------------------

test('deep links: ?homebase=job:<id> | briefing | watch:<id>; nothing else, from any origin only the link', () => {
  assert.deepEqual(parseHomeBaseLink('job:j_abc-1'), { kind: 'job', id: 'j_abc-1' });
  assert.deepEqual(parseHomeBaseLink('watch:w_1'), { kind: 'watch', id: 'w_1' });
  assert.deepEqual(parseHomeBaseLink('briefing'), { kind: 'briefing' });
  for (const bad of ['job:', 'job:../../x', 'job:a/b', 'settings', 'javascript:alert(1)', '', null, 'watch:w 1']) assert.equal(parseHomeBaseLink(bad), null, String(bad));
  assert.equal(homeBaseLinkOf('https://frankwise0202-maker.github.io/jarvis/?homebase=job:j_9'), 'job:j_9');
  assert.equal(homeBaseLinkOf('https://evil.example/phish?homebase=briefing'), 'briefing', 'only the link is ever used');
  assert.equal(homeBaseLinkOf('https://frankwise0202-maker.github.io/jarvis/?homebase=job:../x'), '');
  assert.equal(homeBaseLinkOf('not a url at all ::'), '');
});

test('chat commands: research in the background, what did it find, watch for / tell me when, brief me (the whole sentence)', () => {
  const yes = {
    'Research the best espresso machines under $500 in the background.': { kind: 'research', prompt: 'the best espresso machines under $500', depth: 'quick' },
    'Jarvis, research solar batteries overnight': { kind: 'research', prompt: 'solar batteries', depth: 'quick' },
    'home base, research the best espresso machines under $500': { kind: 'research', prompt: 'the best espresso machines under $500', depth: 'quick' },
    'Have the home base research quantum batteries in depth': { kind: 'research', prompt: 'quantum batteries', depth: 'deep' },
    'Deep research solid-state batteries in the background': { kind: 'research', prompt: 'solid-state batteries', depth: 'deep' },
    'Can you look into heat pumps in the background, please?': { kind: 'research', prompt: 'heat pumps', depth: 'quick' },
    'What did the home base find?': { kind: 'results' },
    'what has my home base found so far': { kind: 'results' },
    'Any results from the home base?': { kind: 'results' },
    'Home base results': { kind: 'results' },
    'Watch for the LG 27GP850 dropping under $300': { kind: 'watch', what: 'the LG 27GP850 dropping under $300' },
    'Tell me when the LG 27GP850 drops under $300.': { kind: 'watch', what: 'When the LG 27GP850 drops under $300' },
    'Home base, let me know if the PS6 is announced': { kind: 'watch', what: 'If the PS6 is announced' },
    'Let me know when the PS6 is announced': { kind: 'watch', what: 'When the PS6 is announced' },
    'home base, tell me when tickets go on sale': { kind: 'watch', what: 'When tickets go on sale' },
    'Home base, keep an eye on the price of the Bambino Plus': { kind: 'watch', what: 'the price of the Bambino Plus' },
    'Have the home base monitor the price of the Bambino Plus': { kind: 'watch', what: 'the price of the Bambino Plus' },
    'Tell me when the Bambino Plus is back in stock': { kind: 'watch', what: 'When the Bambino Plus is back in stock' },
    'Tell me when the iPhone 18 comes out': { kind: 'watch', what: 'When the iPhone 18 comes out' },
    'Let me know when Nintendo announces the Switch 3': { kind: 'watch', what: 'When Nintendo announces the Switch 3' },
    'Keep an eye out for Taylor Swift tickets going on sale': { kind: 'watch', what: 'Taylor Swift tickets going on sale' },
    'Tell me when the Sony XM6 falls below 300 dollars': { kind: 'watch', what: 'When the Sony XM6 falls below 300 dollars' },
    'Brief me': { kind: 'brief' },
    'Brief me.': { kind: 'brief' },
    'Morning briefing': { kind: 'brief' },
    'Give me my morning briefing, please': { kind: 'brief' },
    'Jarvis, what’s my briefing?': { kind: 'brief' },
  };
  for (const [text, want] of Object.entries(yes)) assert.deepEqual(matchBrainCommand(text), want, text);
  const no = [
    'research quantum batteries', // Claude researches it now, as before
    'brief me on the news in Japan',
    'tell me when the next full moon is', // a question
    'tell me when you’re done',
    'tell me when the store opens',
    'watch for changes', // Optics' Watch
    'watch for it',
    'what did you find?',
    'How’s the home base?', // v7.5's status question
    'I want to research the background of the Roman empire',
    'what is a briefing',
    // Everyday questions for Jarvis that only look like a watch (a watch is a paid daily check on the
    // home base): a bare "tell me if" / "let me know if", "keep an eye on", "monitor", "watch out
    // for", the past, "is there", "available in", "cheaper than", a colon, a line break, a question.
    'Let me know if the PS6 is announced',
    'Tell me if this email sounds less than professional: Hi Bob, send me the report now.',
    'Let me know if it’s cheaper to fly or drive from Atlanta to Boston.',
    'Let me know if more than one of these options works for a vegetarian: pasta, steak, salad.',
    'Tell me if there is anything available for dinner tonight near me',
    'Tell me if there is a cheaper alternative to Photoshop',
    'Keep an eye on my grammar while I write this cover letter',
    'Keep an eye on the kids while I cook, any tips?',
    'Keep an eye on the price of the Bambino Plus',
    'Watch out for typos in this paragraph: Teh quick brown fox.',
    'Watch out for typos in the next paragraph',
    'Watch for signs of dehydration in a toddler',
    'Monitor my heart rate during workouts',
    'Monitor my tone in this message and tell me if it is rude: I hate this.',
    'Let me know if this function hits the database more than once:\n\nfunction f(){ db.query(); db.query(); }',
    'Tell me when my code reaches the return statement in this loop',
    'Tell me if the store opens for business on Thanksgiving',
    'Let me know if my essay passes the word count of 500',
    'Let me know if my code passes the tests',
    'Let me know if you have any questions',
    'Tell me when Python 3.12 was released',
    'Tell me when the first iPhone was released',
    'Tell me if the Model Y is available in Canada',
    'Tell me when the Model Y is available in Canada',
    'Tell me if this is cheaper than buying a new one',
    'Let me know if more than 3 people can sit in a Miata',
    'Tell me when Apple usually releases new iPhones',
    'Tell me when the iPhone 18 comes out?',
    'Tell me when this drops under $300',
    'Tell me when the LG 27GP850 drops under $300 and also explain how monitor refresh rates work, what HDR really means and whether I need it',
    // Research: "overnight" / "while I'm at work" that belong to the question.
    'Look into why my sourdough is flat overnight',
    'Find out what my dog does while I’m at work',
    'Research what happened in the markets overnight',
  ];
  for (const text of no) assert.equal(matchBrainCommand(text), null, text);
  // The v7.5 status questions stay theirs.
  assert.equal(matchHomeBaseCommand('home base results'), false);
  assert.equal(matchHomeBaseCommand('What did the home base find?'), false);
});

test('“brief me” the home base can’t answer (out of reach, a 1.0 Core) is briefed as before v7.6; its own answers are said', () => {
  for (const f of [{ kind: 'unreachable' }, { kind: 'aborted' }, { kind: 'down' }, { kind: 'starting' }, { kind: 'refused', message: 'forbidden' }, { kind: 'notcore' }, { kind: 'http', status: 404, code: 'not_found' }, { kind: 'http', status: 404 }, { kind: 'http', status: 503, code: 'internal' }, { ok: false, kind: 'error' }]) {
    assert.equal(briefingFallback(f), true, JSON.stringify(f));
  }
  for (const f of [{ ok: true }, { kind: 'http', status: 404, code: 'none_yet' }, { kind: 'http', status: 409, code: 'no_key' }, { kind: 'http', status: 402, code: 'spend_cap' }, { kind: 'rate' }, { kind: 'unset' }, null]) {
    assert.equal(briefingFallback(f), false, JSON.stringify(f));
  }
});

// ---- the client (fake fetch) ---------------------------------------------------------------------------

function jsonResponse(status, body) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, text: async () => text };
}

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const r = routes(url, init, calls);
    if (r instanceof Error) throw r;
    return r;
  };
  fn.calls = calls;
  return fn;
}

test('client: GET api/brain, PUT api/brain/settings (JSON, the same request options as every home base call)', async () => {
  const f = fakeFetch((url, init) => jsonResponse(200, init.method === 'PUT' ? { ...BRAIN, limits: { dailyUsd: 7.5, monthlyUsd: 50 } } : BRAIN));
  const r = await client.getBrain(BASE, { fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.brain.version, '1.1.0');
  assert.equal(f.calls[0].url, `${BASE}api/brain`);
  assert.deepEqual([f.calls[0].init.credentials, f.calls[0].init.cache, f.calls[0].init.referrerPolicy], ['omit', 'no-store', 'no-referrer']);
  const put = await client.saveBrainSettings(BASE, { limits: { dailyUsd: 7.5 } }, { fetchImpl: f });
  assert.equal(put.brain.limits.dailyUsd, 7.5);
  assert.equal(f.calls[1].init.method, 'PUT');
  assert.equal(f.calls[1].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { limits: { dailyUsd: 7.5 } });
  // A 1.0 Core.
  const old = await client.getBrain(BASE, { fetchImpl: fakeFetch(() => jsonResponse(404, { error: 'not_found', message: 'no such endpoint: /api/brain' })) });
  assert.equal(brainProblem(old).state, 'old');
});

test('client: the key goes once, in the body of POST api/brain/key; never in a failure; DELETE answers 204', async () => {
  const f = fakeFetch(() => jsonResponse(200, { ok: true, hint: '…mnop', verified: true }));
  const r = await client.sendBrainKey(BASE, `  ${KEY}  `, { fetchImpl: f });
  assert.deepEqual(r, { ok: true, hint: '…mnop', verified: true });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${BASE}api/brain/key`);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { key: KEY });
  assert.ok(!f.calls[0].url.includes(KEY), 'never in the address');
  const bad = await client.sendBrainKey(BASE, KEY, { fetchImpl: fakeFetch(() => jsonResponse(400, { error: 'bad_key', message: 'Anthropic did not accept the key' })) });
  assert.equal(bad.ok, false);
  assert.ok(!JSON.stringify(bad).includes(KEY), 'the failure never carries the key');
  assert.equal(brainProblem(bad).state, 'badkey');
  assert.deepEqual(await client.sendBrainKey(BASE, '', { fetchImpl: f }), { ok: false, kind: 'nokey' });
  const del = await client.removeBrainKey(BASE, { fetchImpl: fakeFetch(() => jsonResponse(204)) });
  assert.deepEqual(del, { ok: true });
});

test('client: jobs (202, 409 no_key, 402 spend_cap, list, one with its result, cancel/remove), watchers, briefing, spend, push', async () => {
  const job = { id: 'j_1', kind: 'research', title: 'Espresso', prompt: 'Espresso', depth: 'quick', status: 'queued' };
  let f = fakeFetch(() => jsonResponse(202, { job }));
  let r = await client.startJob(BASE, { prompt: '  Espresso  machines ', depth: 'deep' }, { fetchImpl: f });
  assert.equal(r.job.id, 'j_1');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { kind: 'research', prompt: 'Espresso machines', depth: 'deep' });
  r = await client.startJob(BASE, { prompt: 'x' }, { fetchImpl: fakeFetch(() => jsonResponse(409, { error: 'no_key', message: 'no key' })) });
  assert.equal(brainProblem(r).state, 'nokey');
  r = await client.startJob(BASE, { prompt: 'x' }, { fetchImpl: fakeFetch(() => jsonResponse(402, { error: 'spend_cap', message: 'daily' })) });
  assert.equal(brainProblem(r).state, 'cap');
  assert.deepEqual(await client.startJob(BASE, { prompt: '   ' }), { ok: false, kind: 'empty' });
  f = fakeFetch(() => jsonResponse(200, { jobs: [job, { nope: true }] }));
  r = await client.listJobs(BASE, {}, { fetchImpl: f });
  assert.equal(r.jobs.length, 1);
  assert.equal(f.calls[0].url, `${BASE}api/jobs?limit=50`);
  f = fakeFetch(() => jsonResponse(200, { job: { ...job, status: 'done', result: { markdown: '# x', sources: [] } } }));
  r = await client.getJob(BASE, 'j_1', { fetchImpl: f });
  assert.equal(r.job.result.markdown, '# x');
  assert.equal(f.calls[0].url, `${BASE}api/jobs/j_1`);
  assert.deepEqual(await client.deleteJob(BASE, 'j_1', { fetchImpl: fakeFetch(() => jsonResponse(204)) }), { ok: true, job: null });
  f = fakeFetch(() => jsonResponse(201, { watcher: { id: 'w_1', what: 'x drops', every: '6h', status: 'watching' } }));
  r = await client.addWatcher(BASE, { what: 'x drops', every: '6h' }, { fetchImpl: f });
  assert.equal(r.watcher.every, '6h');
  r = await client.checkWatcher(BASE, 'w_1', { fetchImpl: fakeFetch(() => jsonResponse(202, { watcher: { id: 'w_1', status: 'watching' } })) });
  assert.equal(r.watcher.id, 'w_1');
  r = await client.getBriefing(BASE, { fetchImpl: fakeFetch(() => jsonResponse(404, { error: 'none_yet', message: 'no briefing yet' })) });
  assert.equal(brainProblem(r).state, 'none');
  r = await client.runBriefing(BASE, { fetchImpl: fakeFetch(() => jsonResponse(200, BRIEFING)) });
  assert.equal(r.briefing.greeting, 'Good morning, Tony.');
  r = await client.getSpendDays(BASE, 30, { fetchImpl: fakeFetch(() => jsonResponse(200, { days: [{ day: '2026-11-25', usd: 0.4, calls: 2 }], month: { month: '2026-11', usd: 3 } })) });
  assert.equal(r.days[0].usd, 0.4);
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
  f = fakeFetch(() => jsonResponse(201, { id: 'p_1' }));
  r = await client.pushSubscribe(BASE, sub, 'iPhone', { fetchImpl: f });
  assert.deepEqual(r, { ok: true, id: 'p_1' });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { subscription: sub, label: 'iPhone' });
  assert.deepEqual(await client.pushSubscribe(BASE, { endpoint: 'http://insecure' }, 'x'), { ok: false, kind: 'badsub' });
  f = fakeFetch(() => jsonResponse(204));
  assert.deepEqual(await client.pushUnsubscribe(BASE, sub.endpoint, { fetchImpl: f }), { ok: true });
  assert.equal(f.calls[0].init.method, 'DELETE');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { endpoint: sub.endpoint });
  assert.deepEqual(await client.pushTest(BASE, { fetchImpl: fakeFetch(() => jsonResponse(200, { sent: 1, failed: 0 })) }), { ok: true, sent: 1, failed: 0 });
});

// ---- the controller (fake client) -------------------------------------------------------------------------

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

function fakeClient({ brain = BRAIN, briefing = null, runs = [] } = {}) {
  const calls = [];
  return {
    calls,
    getBrain: async (base) => {
      calls.push(['getBrain', base]);
      return brain ? { ok: true, brain: brainView(brain) } : { ok: false, kind: 'http', status: 404, code: 'not_found' };
    },
    getBriefing: async () => {
      calls.push(['getBriefing']);
      return briefing ? { ok: true, briefing: briefingView(briefing) } : { ok: false, kind: 'http', status: 404, code: 'none_yet' };
    },
    runBriefing: async () => {
      calls.push(['runBriefing']);
      const b = runs.shift() || briefing;
      return b ? { ok: true, briefing: briefingView(b) } : { ok: false, kind: 'unreachable' };
    },
  };
}

test('controller: loads on demand (no polling), follows the address, a 1.0 Core is "old"', async () => {
  let url = BASE;
  const subs = [];
  const fc = fakeClient();
  const brain = createBrain({ getSettings: () => ({ homeBaseUrl: url }), onSettingsChange: (fn) => subs.push(fn), client: fc, storage: memoryStorage() });
  assert.equal(brain.getState().phase, 'idle');
  await brain.load();
  assert.equal(brain.getState().phase, 'ready');
  await brain.load();
  assert.equal(fc.calls.filter((c) => c[0] === 'getBrain').length, 1, 'a second load right after reuses it');
  await brain.load({ force: true });
  assert.equal(fc.calls.filter((c) => c[0] === 'getBrain').length, 2);
  url = '';
  subs.forEach((fn) => fn());
  assert.equal(brain.getState().phase, 'unset');
  assert.deepEqual(await brain.call('getBrain'), { ok: false, kind: 'unset' });
  const old = createBrain({ getSettings: () => ({ homeBaseUrl: BASE }), client: fakeClient({ brain: null }), storage: memoryStorage() });
  await old.load();
  assert.equal(old.getState().problem.state, 'old');
});

test('controller: the morning card shows a new briefing once; dismissed, it is not offered again', async () => {
  const now = Date.now();
  const fresh = { ...BRIEFING, generatedAt: new Date(now - 10 * 60000).toISOString() };
  const storage = memoryStorage();
  const fc = fakeClient({ brain: { ...BRAIN, briefing: { ...BRAIN.briefing, lastAt: fresh.generatedAt } }, briefing: fresh });
  const brain = createBrain({ getSettings: () => ({ homeBaseUrl: BASE }), client: fc, storage });
  await brain.checkMorning();
  assert.equal(brain.morning().greeting, 'Good morning, Tony.');
  brain.dismissMorning();
  assert.equal(brain.morning(), null);
  assert.equal(Number(storage.getItem('jarvis.ui.homebaseBriefingSeen')), Date.parse(fresh.generatedAt));
  const again = createBrain({ getSettings: () => ({ homeBaseUrl: BASE }), client: fc, storage });
  const before = fc.calls.filter((c) => c[0] === 'getBriefing').length;
  await again.checkMorning();
  assert.equal(again.morning(), null, 'seen: no card');
  assert.equal(fc.calls.filter((c) => c[0] === 'getBriefing').length, before, 'and no need to fetch it');
});

test('controller: "brief me" shows a recent briefing, makes a new one when it is old or there is none', async () => {
  const now = Date.now();
  const recent = { ...BRIEFING, generatedAt: new Date(now - 30 * 60000).toISOString() };
  const stale = { ...BRIEFING, generatedAt: new Date(now - 9 * 3600000).toISOString(), greeting: 'Good morning (old).' };
  const made = { ...BRIEFING, generatedAt: new Date(now).toISOString(), greeting: 'Good evening, Tony.' };
  let fc = fakeClient({ briefing: recent });
  let brain = createBrain({ getSettings: () => ({ homeBaseUrl: BASE }), client: fc, storage: memoryStorage() });
  let r = await brain.latestBriefing();
  assert.equal(r.briefing.greeting, 'Good morning, Tony.');
  assert.ok(!fc.calls.some((c) => c[0] === 'runBriefing'));
  fc = fakeClient({ briefing: stale, runs: [made] });
  brain = createBrain({ getSettings: () => ({ homeBaseUrl: BASE }), client: fc, storage: memoryStorage() });
  r = await brain.latestBriefing();
  assert.equal(r.briefing.greeting, 'Good evening, Tony.');
  fc = fakeClient({ briefing: null, runs: [made] });
  brain = createBrain({ getSettings: () => ({ homeBaseUrl: BASE }), client: fc, storage: memoryStorage() });
  r = await brain.latestBriefing();
  assert.equal(r.briefing.greeting, 'Good evening, Tony.');
  // Making one fails: the old one is better than nothing.
  fc = fakeClient({ briefing: stale, runs: [] });
  fc.runBriefing = async () => ({ ok: false, kind: 'unreachable' });
  brain = createBrain({ getSettings: () => ({ homeBaseUrl: BASE }), client: fc, storage: memoryStorage() });
  r = await brain.latestBriefing();
  assert.equal(r.briefing.greeting, 'Good morning (old).');
});

// ---- the service worker: push and notification clicks ----------------------------------------------------------

function loadServiceWorker({ clients = [] } = {}) {
  const src = readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8').replace('/*__PRECACHE__*/[]', '[]').replaceAll('__BUILD_ID__', 'test1');
  const handlers = {};
  const shown = [];
  const opened = [];
  const scope = 'https://frankwise0202-maker.github.io/jarvis/';
  const self = {
    location: { href: `${scope}sw.js`, origin: 'https://frankwise0202-maker.github.io' },
    addEventListener: (type, fn) => (handlers[type] = fn),
    registration: { scope, showNotification: async (title, options) => shown.push({ title, options }) },
    clients: { matchAll: async () => clients, openWindow: async (url) => opened.push(url), claim: async () => {} },
    skipWaiting: () => {},
  };
  vm.runInNewContext(src, { self, URL, caches: {}, fetch: async () => ({}), console, setTimeout, clearTimeout });
  const fire = async (type, event) => {
    const waits = [];
    handlers[type]({ ...event, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  return { handlers, shown, opened, fire, scope };
}

test('service worker: a push from the Core is shown; of its url only the home base link is kept', async () => {
  const sw = loadServiceWorker();
  const data = (obj) => ({ json: () => obj, text: () => JSON.stringify(obj) });
  await sw.fire('push', { data: data({ title: 'Research done', body: 'Best espresso machines under $500', url: 'https://frankwise0202-maker.github.io/jarvis/?homebase=job:j_42', tag: 'job-j_42' }) });
  assert.equal(sw.shown.length, 1);
  const n = sw.shown[0];
  assert.equal(n.title, 'Research done');
  assert.equal(n.options.body, 'Best espresso machines under $500');
  assert.equal(n.options.data.homebase, 'job:j_42');
  assert.equal(n.options.data.url, `${sw.scope}?homebase=job:j_42`);
  assert.equal(n.options.tag, 'homebase-job-j_42');
  assert.equal(n.options.icon, `${sw.scope}icons/icon-192.png`);
  // Another site's address, a bad link, no JSON: still shown, never pointing elsewhere.
  await sw.fire('push', { data: data({ title: 'x\u0007y', body: 'b', url: 'https://evil.example/?homebase=settings' }) });
  assert.equal(sw.shown[1].title, 'x y');
  assert.equal(sw.shown[1].options.data.homebase, '');
  assert.equal(sw.shown[1].options.data.url, sw.scope);
  await sw.fire('push', { data: { json: () => { throw new Error('not json'); }, text: () => 'plain words' } });
  assert.deepEqual([sw.shown[2].title, sw.shown[2].options.body], ['Jarvis', 'plain words']);
  await sw.fire('push', { data: null });
  assert.equal(sw.shown[3].title, 'Jarvis', 'iOS requires every push to show something');
});

test('service worker: tapping a home base notification hands an open Jarvis the link, or opens Jarvis at it', async () => {
  const messages = [];
  let focused = 0;
  const client = { url: 'https://frankwise0202-maker.github.io/jarvis/', focus: async () => (focused += 1), postMessage: (m) => messages.push(JSON.parse(JSON.stringify(m))) }; // (a plain object from the worker's realm)
  let sw = loadServiceWorker({ clients: [client] });
  let closed = 0;
  const note = (data) => ({ notification: { data, close: () => (closed += 1) } });
  await sw.fire('notificationclick', note({ url: `${sw.scope}?homebase=briefing`, homebase: 'briefing' }));
  assert.deepEqual(messages, [{ type: 'HOMEBASE_LINK', link: 'briefing' }]);
  assert.equal(focused, 1);
  assert.equal(closed, 1);
  assert.deepEqual(sw.opened, []);
  // No Jarvis open: it opens at the link.
  sw = loadServiceWorker({ clients: [] });
  await sw.fire('notificationclick', note({ url: `${sw.scope}?homebase=watch:w_7`, homebase: 'watch:w_7' }));
  assert.deepEqual(sw.opened, [`${sw.scope}?homebase=watch:w_7`]);
  // A forged link never opens anything but Jarvis itself.
  sw = loadServiceWorker({ clients: [] });
  await sw.fire('notificationclick', note({ url: 'https://evil.example/', homebase: 'job:../../x' }));
  assert.deepEqual(sw.opened, [sw.scope]);
  // The v7.0 "mission finished" notification is unchanged: focus, no message.
  messages.length = 0;
  sw = loadServiceWorker({ clients: [client] });
  await sw.fire('notificationclick', note({ url: sw.scope }));
  assert.deepEqual(messages, []);
});
