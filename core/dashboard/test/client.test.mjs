// Unit tests for app/client.js: the data link's first read, the stream, the watchdog and the
// reconnect backoff, with a fake EventSource, a fake fetch and mocked timers.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createClient } from '../app/client.js';

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
    const e = { data: JSON.stringify(data) };
    if (type === 'message') this.onmessage?.(e);
    else for (const fn of this.listeners[type] || []) fn(e);
  }
  fail() {
    this.readyState = 2;
    this.onerror?.({});
  }
}

function setup() {
  FakeES.all = [];
  let clock = 0;
  const calls = [];
  const seen = { status: 0, snapshot: 0, info: 0, history: 0, events: 0, links: [] };
  const fetchImpl = async (url) => {
    calls.push(url);
    const body = url.startsWith('api/info') ? { version: '1' } : url.startsWith('api/status') ? { t: 1 } : url.startsWith('api/history') ? { series: {} } : { events: [] };
    return { ok: true, status: 200, json: async () => body };
  };
  const client = createClient({
    fetchImpl,
    EventSourceImpl: FakeES,
    monoNow: () => clock,
    onStatus: () => seen.status++,
    onSnapshot: () => seen.snapshot++,
    onInfo: () => seen.info++,
    onHistory: () => seen.history++,
    onEvents: () => seen.events++,
    onLink: (v) => seen.links.push(v),
  });
  return {
    client,
    calls,
    seen,
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
  assert.deepEqual(h.calls.map((c) => c.split('?')[0]).sort(), ['api/events', 'api/history', 'api/info', 'api/status']);
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
  await flush();
  assert.equal(statusReads(), before + 1, 'and one full read');
  h.advance(4000);
  assert.deepEqual(h.seen.links, [true], 'not called offline while the new stream connects');
  FakeES.all[1].send({ t: 2 });
  h.advance(4000);
  assert.deepEqual(h.seen.links, [true], 'still online: no red banner at all');
  h.advance(6000);
  assert.deepEqual(h.seen.links, [true, false], 'a Core that really is gone still shows as offline');
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
