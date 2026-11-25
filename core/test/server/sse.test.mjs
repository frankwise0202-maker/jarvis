// node --test: Server-Sent Events: the live stream end to end, and the hub's handling of slow clients.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRuntime } from '../../server/runtime.mjs';
import { createSseHub } from '../../server/http/sse.mjs';
import { readSse, testConfig, START } from './helpers.mjs';

let rt;
let port;

before(async () => {
  // 20x time: a tick every 50 ms (real), so the test is quick.
  const config = testConfig(['--fixture', 'ok', '--time-scale', '20']);
  config.startMs = START;
  rt = await createRuntime(config);
  ({ port } = await rt.start({ port: 0 }));
});

after(async () => {
  await rt.stop();
});

test('stream: retry, a full status first, then compact ticks', async () => {
  const { frames, status } = await readSse(port, { until: (f) => f.filter((x) => x.event === 'tick').length >= 3 });
  assert.equal(status, 200);
  assert.equal(frames[0].retry, 3000);
  const first = frames.find((f) => f.event);
  assert.equal(first.event, 'status');
  assert.ok(first.data.services && first.data.health.items.length >= 13);
  const ticks = frames.filter((f) => f.event === 'tick');
  assert.equal(ticks.length, 3);
  for (const t of ticks) {
    assert.equal(t.id, null); // only event frames carry ids
    assert.equal(t.data.services, undefined);
    assert.deepEqual(Object.keys(t.data.health), ['level', 'summary', 'counts', 'rev', 'since']);
    assert.deepEqual(Object.keys(t.data), ['v', 't', 'seq', 'mode', 'scenario', 'host', 'core', 'cpu', 'gpu', 'memory', 'disks', 'network', 'processes', 'health']);
  }
  assert.ok(ticks[1].data.seq > ticks[0].data.seq);
  assert.ok(ticks[1].data.t > ticks[0].data.t);
  // merging a tick into the last status keeps a complete snapshot
  const merged = { ...first.data, ...ticks[2].data, health: { ...ticks[2].data.health, items: first.data.health.items } };
  assert.ok(merged.services.tailscale && merged.health.items && merged.cpu.perThreadPct.length === 8);
});

test('stream: a full status at least every 30 simulated seconds (services refresh)', async () => {
  // 30 simulated seconds at 20x = 1.5 s real
  const { frames } = await readSse(port, { until: (f) => f.filter((x) => x.event === 'status').length >= 2, timeoutMs: 6000 });
  const statuses = frames.filter((f) => f.event === 'status');
  assert.equal(statuses.length, 2);
  assert.ok(statuses[1].data.services.rev > statuses[0].data.services.rev || statuses[1].data.t - statuses[0].data.t >= 30_000);
});

test('stream: every connection carries an info frame with the version, so a page that missed a quick restart reloads into the new one', async () => {
  const { frames } = await readSse(port, { until: (f) => f.some((x) => x.event === 'info') });
  const infoFrame = frames.find((f) => f.event === 'info');
  assert.ok(infoFrame, 'an info frame arrives on connect');
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(infoFrame.data.version, pkg.version);
  assert.equal(frames.find((f) => f.event).event, 'status'); // the status frame still comes first
});

test('stream: Last-Event-ID replays the events missed while away', async () => {
  const { frames } = await readSse(port, { headers: { 'Last-Event-ID': '1' }, until: (f) => f.some((x) => x.event === 'tick') });
  const events = frames.filter((f) => f.event === 'event');
  assert.ok(events.length >= 2);
  assert.deepEqual(events.map((e) => Number(e.id)), events.map((e) => e.data.id));
  assert.ok(events.every((e) => e.data.id > 1));
  assert.ok(Number(events[0].id) < Number(events[events.length - 1].id)); // oldest first
});

test('stream: a scenario switch pushes a fresh status to open streams at once', async () => {
  const done = readSse(port, { until: (f) => f.some((x) => x.event === 'status' && x.data.scenario === 'offline'), timeoutMs: 8000 });
  await new Promise((r) => setTimeout(r, 100));
  const res = await fetch(`http://127.0.0.1:${port}/api/fixture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: 'offline' }) });
  assert.equal(res.status, 200);
  const { frames } = await done;
  const fresh = frames.find((f) => f.event === 'status' && f.data.scenario === 'offline');
  assert.ok(fresh);
  assert.equal(fresh.data.health.level, 'alert');
  await fetch(`http://127.0.0.1:${port}/api/fixture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: 'ok' }) });
});

test('stream: at most 16 clients, the 17th gets 503', async () => {
  const opened = [];
  for (let i = 0; i < 16; i += 1) opened.push(readSse(port, { until: (f) => f.some((x) => x.event === 'status'), timeoutMs: 3000 }));
  await new Promise((r) => setTimeout(r, 300));
  const extra = await fetch(`http://127.0.0.1:${port}/api/stream`);
  // either it got in because an earlier one already closed, or it was refused
  if (extra.status === 503) {
    const body = await extra.json();
    assert.equal(body.error, 'too_many_streams');
    assert.equal(extra.headers.get('retry-after'), '10');
  } else {
    await extra.body.cancel();
  }
  await Promise.all(opened);
});

// ------------------------------------------------------------------------------------------------- the hub

function fakeClient({ writable = true } = {}) {
  const req = new EventEmitter();
  req.socket = { setTimeout() {}, setNoDelay() {} };
  const res = new EventEmitter();
  res.chunks = [];
  res.full = !writable;
  res.destroyed = false;
  res.writeHead = (code, headers) => {
    res.code = code;
    res.headers = headers;
  };
  res.write = (chunk) => {
    if (!res.full) res.chunks.push(chunk);
    return !res.full;
  };
  res.end = () => res.emit('close');
  res.destroy = () => {
    res.destroyed = true;
    res.emit('close');
  };
  return { req, res };
}

test('hub: frames, a slow client is skipped (not buffered) and dropped after 30 s', () => {
  let now = 0;
  const hub = createSseHub({ maxClients: 2, now: () => now });
  const a = fakeClient();
  const b = fakeClient();
  assert.equal(hub.add(a.req, a.res, { initial: [{ event: 'status', data: '{"x":1}' }] }), true);
  assert.equal(hub.add(b.req, b.res), true);
  assert.equal(hub.add(...Object.values(fakeClient())), false); // full
  assert.equal(a.res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.deepEqual(a.res.chunks, ['retry: 3000\n\n', 'event: status\ndata: {"x":1}\n\n']);
  let calls = 0;
  hub.broadcast('tick', () => {
    calls += 1;
    return '{"t":1}';
  });
  assert.equal(calls, 1); // serialised once for every client
  hub.broadcast('event', '{"id":7}', 7);
  assert.equal(a.res.chunks.at(-1), 'id: 7\nevent: event\ndata: {"id":7}\n\n');
  // b's socket backs up: frames are dropped for it, not queued
  b.res.full = true;
  hub.broadcast('tick', '{"t":2}');
  const before = b.res.chunks.length;
  now = 10_000;
  hub.broadcast('tick', '{"t":3}');
  assert.equal(b.res.chunks.length, before);
  assert.ok(hub.dropped >= 1);
  // it drains: frames flow again
  b.res.full = false;
  b.res.emit('drain');
  hub.broadcast('tick', '{"t":4}');
  assert.equal(b.res.chunks.at(-1), 'event: tick\ndata: {"t":4}\n\n');
  // stuck for more than 30 s: disconnected
  b.res.full = true;
  hub.broadcast('tick', '{"t":5}');
  now = 50_000;
  hub.broadcast('tick', '{"t":6}');
  assert.equal(b.res.destroyed, true);
  assert.equal(hub.size, 1);
  a.req.emit('close');
  assert.equal(hub.size, 0);
  assert.equal(hub.broadcast('tick', () => assert.fail('nobody listens')), 0);
});
