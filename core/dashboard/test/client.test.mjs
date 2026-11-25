// Unit tests for app/client.js: the data link's first read, the stream, the watchdog and the
// reconnect backoff, with a fake EventSource, a fake fetch and mocked timers.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createClient, hasBrainApi } from '../app/client.js';

class FakeES {
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.closed = false;
    this.listeners = {};
    FakeES.all.push(this);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  send(data, type = 'message') {
    const e = { type, data: JSON.stringify(data) };
    if (type === 'message') this.onmessage?.(e);
    else for (const fn of this.listeners[type] || []) fn(e);
  }
  fail() {
    this.readyState = 2;
    this.onerror?.({});
  }
  /** The connection is (re)established: the browser fires `open`, on its own retries too. */
  open() {
    this.readyState = 1;
    this.onopen?.({ type: 'open' });
  }
  /** The connection dropped (the Core restarting): the browser will retry by itself. */
  drop() {
    this.readyState = 0;
    this.onerror?.({});
  }
}

function setup(core = { version: '1.1.0' }) {
  FakeES.all = [];
  let clock = 0;
  const calls = [];
  const seen = { status: 0, snapshot: 0, info: 0, history: 0, events: 0, links: [], versions: [] };
  const fetchImpl = async (url) => {
    calls.push(url);
    const body = url.startsWith('api/info') ? { version: core.version } : url.startsWith('api/brain') ? { version: '1.1.0', briefing: { lastAt: '2026-11-25T07:00:00Z' } } : url.startsWith('api/status') ? { t: 1 } : url.startsWith('api/history') ? { series: {} } : { events: [] };
    return { ok: true, status: 200, json: async () => body };
  };
  const client = createClient({
    fetchImpl,
    EventSourceImpl: FakeES,
    monoNow: () => clock,
    onStatus: () => seen.status++,
    onSnapshot: () => seen.snapshot++,
    onInfo: (b) => {
      seen.info++;
      seen.versions.push(b.version);
    },
    onHistory: () => seen.history++,
    onEvents: () => seen.events++,
    onLink: (v) => seen.links.push(v),
  });
  return {
    client,
    calls,
    seen,
    core,
    /** The page asleep in the background: the monotonic clock moves on, its timers do not run. */
    sleep(ms) {
      clock += ms;
    },
    /** Move both clocks forward, one second at a time (like the real page). */
    advance(ms) {
      while (ms > 0) {
        const step = Math.min(1000, ms);
        clock += step;
        mock.timers.tick(step);
        ms -= step;
      }
    },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

test('first read, then the stream; a silent Core goes offline after 5 s and comes back', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const h = setup();
  await h.client.start();
  // The brain (Core 1.1.0) is read with everything else: api/brain, then its jobs, watchers and briefing.
  assert.deepEqual(h.calls.map((c) => c.split('?')[0]).sort(), ['api/brain', 'api/briefing', 'api/events', 'api/history', 'api/info', 'api/jobs', 'api/status', 'api/watchers']);
  assert.equal(FakeES.all.length, 1);
  assert.equal(FakeES.all[0].url, 'api/stream');
  FakeES.all[0].send({ t: 2 });
  assert.equal(h.seen.snapshot, 1);
  assert.deepEqual(h.seen.links, [true]);
  h.advance(4000);
  assert.deepEqual(h.seen.links, [true], 'four quiet seconds are fine');
  h.advance(2000);
  assert.deepEqual(h.seen.links, [true, false], 'offline after five');
  FakeES.all[0].send({ t: 3 });
  assert.deepEqual(h.seen.links, [true, false, true]);
  await flush();
  assert.ok(h.calls.filter((c) => c.startsWith('api/status')).length >= 2, 'back from an outage: one full read');
  h.client.stop();
});

test('a stream the browser gave up on is reopened with backoff', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const h = setup();
  await h.client.start();
  FakeES.all[0].fail();
  assert.equal(FakeES.all.length, 1);
  h.advance(999);
  assert.equal(FakeES.all.length, 1);
  h.advance(1);
  assert.equal(FakeES.all.length, 2, 'first retry after 1 s');
  assert.equal(FakeES.all[0].closed, true);
  FakeES.all[1].fail();
  h.advance(1999);
  assert.equal(FakeES.all.length, 2);
  h.advance(1);
  assert.equal(FakeES.all.length, 3, 'then after 2 s');
  FakeES.all[2].send({ t: 1 });
  FakeES.all[2].fail();
  h.advance(1000);
  assert.equal(FakeES.all.length, 4, 'a message resets the backoff');
  assert.equal(h.client.stats().reconnects, 3);
  h.client.stop();
});

test('a stream that stays silent is replaced; pushed events and statuses are delivered', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const h = setup();
  await h.client.start();
  const es = FakeES.all[0];
  es.send({ title: 'Disk / is 91% full', level: 'warn' }, 'event');
  es.send({ t: 5 }, 'status');
  assert.equal(h.seen.events, 2, 'one from the first read, one pushed');
  assert.equal(h.seen.status, 2);
  es.send({ t: 6 });
  h.advance(10000);
  assert.equal(FakeES.all.length, 1, 'ten quiet seconds: still the same stream');
  h.advance(2000);
  assert.equal(FakeES.all.length, 2, 'then it is replaced');
  assert.equal(es.closed, true);
  h.client.stop();
  const count = FakeES.all.length;
  h.advance(60000);
  assert.equal(FakeES.all.length, count, 'stop() means stop');
});

test('malformed stream data is ignored', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const h = setup();
  await h.client.start();
  FakeES.all[0].onmessage({ data: 'not json' });
  assert.equal(h.seen.snapshot, 0);
  assert.deepEqual(h.seen.links, []);
  h.client.stop();
});

test('back from the background (a phone unlocked): a new stream at once, no offline flash', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const h = setup();
  await h.client.start();
  FakeES.all[0].send({ t: 1 });
  assert.deepEqual(h.seen.links, [true]);
  const statusReads = () => h.calls.filter((c) => c.startsWith('api/status')).length;
  const before = statusReads();
  // The page slept for a minute: its timers did not run and the stream died silently.
  h.sleep(60000);
  h.client.resume();
  assert.equal(FakeES.all.length, 2, 'a new stream right away');
  assert.equal(FakeES.all[0].closed, true, 'the old one closed');
  FakeES.all[1].open();
  await flush();
  assert.equal(statusReads(), before + 1, 'and one full read (its stream opening does not read again)');
  h.advance(4000);
  assert.deepEqual(h.seen.links, [true], 'not called offline while the new stream connects');
  FakeES.all[1].send({ t: 2 });
  h.advance(4000);
  assert.deepEqual(h.seen.links, [true], 'still online: no red banner at all');
  h.advance(6000);
  assert.deepEqual(h.seen.links, [true, false], 'a Core that really is gone still shows as offline');
  h.client.stop();
});

test('a quick Core restart (back within the browser\'s 3 s retry, never offline) reads api/info again: the new version reaches onInfo', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const h = setup({ version: '1.0.0' });
  await h.client.start();
  const es = FakeES.all[0];
  es.open();
  es.send({ t: 1 }, 'status');
  await flush();
  assert.deepEqual(h.seen.versions, ['1.0.0'], 'the first open follows the first read: no second read');
  assert.ok(!h.calls.includes('api/brain'), 'a 1.0 Core is not asked for a brain');
  // systemctl restart into 1.1.0: the stream drops, the browser retries by itself, the Core is
  // back in 1.8 s (well inside the 5 s the watchdog waits).
  h.core.version = '1.1.0';
  es.drop();
  h.advance(1800);
  es.open();
  es.send({ t: 2 }, 'status');
  await flush();
  await flush();
  assert.deepEqual(h.seen.links, [true], 'never called offline');
  assert.deepEqual(h.seen.versions, ['1.0.0', '1.1.0'], 'api/info read again: the kiosk reloads into the new version');
  assert.ok(h.calls.includes('api/brain'), 'and the brain is read at once');
  assert.equal(h.client.stats().reopenReads, 1);
  // The browser gave up instead (a proxy answering 502 while the Core restarts): our own reconnect
  // opens a new stream while the page is still online, and that open reads everything too.
  h.core.version = '1.1.1';
  es.fail();
  h.advance(1000);
  assert.equal(FakeES.all.length, 2);
  FakeES.all[1].open();
  FakeES.all[1].send({ t: 3 }, 'status');
  await flush();
  await flush();
  assert.deepEqual(h.seen.links, [true]);
  assert.deepEqual(h.seen.versions, ['1.0.0', '1.1.0', '1.1.1']);
  h.client.stop();
});

test('an info frame on the stream updates the version the brain poll goes by', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const h = setup({ version: '1.0.0' });
  await h.client.start();
  const es = FakeES.all[0];
  es.open();
  es.send({ t: 0 }, 'status');
  es.send({ version: '1.1.0' }, 'info');
  assert.deepEqual(h.seen.versions, ['1.0.0', '1.1.0']);
  for (let i = 1; i <= 61; i++) {
    h.advance(1000);
    es.send({ t: i });
  }
  await flush();
  assert.equal(h.client.stats().brainReads, 1, 'the 60 s poll reads the brain of the new Core');
  assert.ok(h.calls.includes('api/brain'));
  h.client.stop();
});

test('without resume, a page waking from a long sleep would first show the Core offline', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const h = setup();
  await h.client.start();
  FakeES.all[0].send({ t: 1 });
  h.sleep(60000);
  h.advance(1000);
  assert.deepEqual(h.seen.links, [true, false], 'the red banner the phone used to show on unlock');
  h.client.stop();
});

test('a Core without a brain (404) gets no brain reads; a brain Core streams job/watcher/spend/briefing frames and is polled slowly', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  for (const [hasBrain, version] of [
    [false, '1.0.0'],
    [false, undefined],
    [true, '1.1.0'],
  ]) {
    FakeES.all = [];
    const calls = [];
    const got = { brain: [], jobs: 0, watchers: 0, briefing: [], frames: [] };
    const fetchImpl = async (url) => {
      calls.push(url.split('?')[0]);
      if (url.startsWith('api/brain') && !hasBrain) return { ok: false, status: 404, json: async () => ({ error: 'not_found', message: 'Not found' }) };
      if (url.startsWith('api/briefing')) return { ok: false, status: 404, json: async () => ({ error: 'none_yet', message: 'No briefing yet' }) };
      if (url.startsWith('api/info')) return { ok: true, status: 200, json: async () => ({ version: version }) };
      const body = url.startsWith('api/brain') ? { version: '1.1.0', key: { set: false }, briefing: { lastAt: null } } : url.startsWith('api/jobs') ? { jobs: [] } : url.startsWith('api/watchers') ? { watchers: [] } : url.startsWith('api/status') ? { t: 1 } : {};
      return { ok: true, status: 200, json: async () => body };
    };
    const client = createClient({
      fetchImpl,
      EventSourceImpl: FakeES,
      monoNow: () => 0,
      onStatus() {},
      onSnapshot() {},
      onInfo() {},
      onHistory() {},
      onEvents() {},
      onLink() {},
      onBrain: (b) => got.brain.push(b),
      onJobs: () => got.jobs++,
      onWatchers: () => got.watchers++,
      onBriefing: (b) => got.briefing.push(b),
      onBrainEvent: (name, body) => got.frames.push([name, body.id ?? body.todayUsd ?? body.date]),
    });
    await client.start();
    await flush();
    if (!hasBrain) {
      assert.deepEqual(got.brain, [null], 'a 1.0 Core, or a 404, means no brain');
      if (version === '1.0.0') assert.equal(calls.filter((c) => c === 'api/brain').length, 0, 'a 1.0 Core is not asked for its brain (no 404 in the console)');
      assert.equal(calls.filter((c) => c === 'api/jobs' || c === 'api/watchers' || c === 'api/briefing').length, 0, 'nothing else of the brain is read');
    } else {
      assert.equal(got.brain.length, 1);
      assert.equal(got.jobs, 1);
      assert.equal(got.watchers, 1);
      assert.deepEqual(got.briefing, [null], 'none yet (briefing.lastAt null)');
      assert.equal(calls.filter((c) => c === 'api/briefing').length, 0, 'no briefing is asked for before the first one (no 404 none_yet)');
      const es = FakeES.all[0];
      es.send({ id: 'j_1', status: 'running' }, 'job');
      es.send({ id: 'w_1', status: 'met' }, 'watcher');
      es.send({ todayUsd: 0.42 }, 'spend');
      es.send({ date: '2026-11-25' }, 'briefing');
      assert.deepEqual(got.frames, [
        ['job', 'j_1'],
        ['watcher', 'w_1'],
        ['spend', 0.42],
        ['briefing', '2026-11-25'],
      ]);
      const before = calls.filter((c) => c === 'api/brain').length;
      mock.timers.tick(60000);
      await flush();
      await flush();
      assert.equal(calls.filter((c) => c === 'api/brain').length, before + 1, 'the slow poll reads api/brain again after a minute');
    }
    client.stop();
  }
});

test('the brain API exists from Core 1.1.0', () => {
  assert.equal(hasBrainApi('1.0.0'), false);
  assert.equal(hasBrainApi('1.0.9'), false);
  assert.equal(hasBrainApi('1.1.0'), true);
  assert.equal(hasBrainApi('v1.2.3'), true);
  assert.equal(hasBrainApi('2.0.0'), true);
  assert.equal(hasBrainApi(undefined), true, 'a Core that does not say is asked (a 404 then hides the brain)');
});
