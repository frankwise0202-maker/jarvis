#!/usr/bin/env node
// A stand-in Core for developing and testing the dashboard without the real server: serves
// core/dashboard/ and the Core's API with fixture data (test/fixtures.mjs), speaking the same
// protocol as core/server (SSE frames `status`, `tick`, `event`; GET /api/fixture and
// POST /api/fixture { scenario }). Node built-ins only.
//
//   node core/dashboard/test/mock-server.mjs [--port 8790] [--scenario ok|warn|alert|nogpu|offline]
//                                            [--rate 1] [--start 2026-11-25T21:47:00Z]
//
// --rate is ticks per real second; each tick advances simulated time by one second, so --rate 200
// plays a day in about seven minutes (the long-run test). The mock alone also takes
// POST /__control { rate?, down?: boolean, time? }: `down` makes the whole Core stop answering
// (streams dropped, connections refused) the way a crashed or restarting Core would.
//
// The home base brain (Core 1.1.0): --brain ok|nokey|overcap|sdk|noweather|long|waiting|full|busy
// serves GET api/brain, api/jobs, api/watchers, api/briefing (404 none_yet for `waiting`) from
// brain-fixtures.mjs; --brain none (the default) is a 1.0.0 Core whose api/brain answers 404.
// POST /__control also takes { brain: preset } (pushes a spend frame), { briefing: true } (a new
// briefing now: pushes the compact `briefing` frame, as the Core does), { job: {...} } and
// { watcher: {...} } (pushed as frames and kept), { timeZone }.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compactOf, makeEvents, makeHistory, makeStatus, mockAnswer, SCENARIOS } from './fixtures.mjs';
import { BRAIN_PRESETS, makeBriefing, makeBrain } from './brain-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const EVENT_EVERY_MS = 10 * 60 * 1000; // long runs: one new event every ten simulated minutes

export function startMockCore({ port = 8790, scenario = 'ok', rate = 1, start = Date.parse('2026-11-25T21:47:00Z'), quiet = true, brain = 'none', timeZone = 'UTC', briefingAt = null } = {}) {
  const state = { scenario, rate, down: false, simT: start, startT: start, seq: 0, asks: 0, nextId: 1000, brainPreset: BRAIN_PRESETS.includes(brain) ? brain : 'none', timeZone, brainReads: 0 };
  // The brain's data, made at the start (or when the preset changes) and then kept, like the Core's files.
  let brainData = makeBrain(state.brainPreset, briefingAt ?? start, { timeZone });
  const streams = new Set();
  let events = makeEvents(scenario, start);
  let lastEventAt = start;

  const status = () => makeStatus(state.scenario, state.simT, state.startT, state.seq);
  const frame = (event, data, id = null) => `${id !== null ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  function send(res, code, body, type = 'application/json') {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'content-security-policy': CSP });
    res.end(data);
  }

  async function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.resolve(ROOT, `.${rel}`);
    if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}test${path.sep}`)) return send(res, 404, { error: 'not found' });
    try {
      const st = await stat(file);
      if (!st.isFile()) return send(res, 404, { error: 'not found' });
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'content-security-policy': CSP });
      res.end(body);
    } catch {
      send(res, 404, { error: 'not found' });
    }
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => {
        data += c;
        if (data.length > 4096) req.destroy();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data || '{}'));
        } catch {
          resolve({});
        }
      });
    });
  }

  function broadcast(text) {
    if (state.down) return;
    for (const res of streams) res.write(text);
  }

  function setBrain(preset) {
    state.brainPreset = BRAIN_PRESETS.includes(preset) ? preset : 'none';
    brainData = makeBrain(state.brainPreset, state.simT, { timeZone: state.timeZone });
    if (brainData.brain) broadcast(frame('spend', brainData.brain.spend));
  }

  function setScenario(name) {
    state.scenario = name;
    events = [...events.filter((e) => e.id >= 1000), ...makeEvents(name, state.startT)].sort((a, b) => a.t - b.t);
    broadcast(frame('status', status()));
  }

  // One tick per simulated second; fast paces run several per 10 ms timer (Node timers are not
  // precise below that). A full `status` frame every 30 simulated seconds, like the Core.
  let timer = null;
  function schedule() {
    if (timer) clearInterval(timer);
    const every = Math.max(10, Math.round(1000 / Math.max(0.1, state.rate)));
    const perTick = Math.max(1, Math.round((state.rate * every) / 1000));
    timer = setInterval(() => {
      for (let i = 0; i < perTick; i++) {
        state.simT += 1000;
        state.seq++;
        if (state.simT - lastEventAt >= EVENT_EVERY_MS) {
          lastEventAt = state.simT;
          const n = state.nextId - 999;
          const ev = { id: state.nextId++, t: state.simT, level: n % 7 === 3 ? 'warn' : n % 7 === 4 ? 'ok' : 'info', kind: 'health', rule: 'net.latency', message: n % 7 === 3 ? `Internet slow: ${180 + (n % 40)} ms` : n % 7 === 4 ? 'Internet latency back to normal' : `Hourly check ${n}: all systems normal` };
          events.push(ev);
          if (events.length > 500) events = events.slice(-500);
          broadcast(frame('event', ev, ev.id));
        }
        if (!streams.size) continue;
        const snap = status();
        broadcast(frame('tick', compactOf(snap)));
        if (state.seq % 30 === 0) broadcast(frame('status', snap));
      }
    }, every);
  }
  schedule();

  function dropStreams() {
    for (const res of streams) res.destroy();
    streams.clear();
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (p === '/__control' && req.method === 'POST') {
      const body = await readBody(req);
      if (Number.isFinite(body.rate) && body.rate > 0) {
        state.rate = body.rate;
        schedule();
      }
      if (Number.isFinite(body.time)) {
        state.simT = body.time;
        state.startT = body.time;
        lastEventAt = body.time;
        events = makeEvents(state.scenario, body.time);
      }
      if (SCENARIOS.includes(body.scenario) && body.scenario !== state.scenario) setScenario(body.scenario);
      if (typeof body.down === 'boolean') state.down = body.down;
      if (typeof body.timeZone === 'string') state.timeZone = body.timeZone;
      if (typeof body.brain === 'string') setBrain(body.brain);
      if (brainData.brain && body.briefing === true) {
        const b = makeBriefing(state.brainPreset, state.simT, { timeZone: state.timeZone, keySet: brainData.brain.key.set, located: !!brainData.brain.briefing.location });
        brainData.briefing = b;
        brainData.brain.briefing.lastAt = b.generatedAt;
        broadcast(frame('briefing', { date: b.date, generatedAt: b.generatedAt, kind: b.kind, greeting: b.greeting }));
      }
      if (brainData.brain && body.job && typeof body.job === 'object') {
        brainData.jobs = [body.job, ...brainData.jobs.filter((j) => j.id !== body.job.id)].slice(0, 50);
        broadcast(frame('job', body.job));
      }
      if (brainData.brain && body.spend && typeof body.spend === 'object') {
        brainData.brain.spend = body.spend;
        broadcast(frame('spend', body.spend));
      }
      if (brainData.brain && body.watcher && typeof body.watcher === 'object') {
        brainData.watchers = [body.watcher, ...brainData.watchers.filter((w) => w.id !== body.watcher.id)].slice(0, 20);
        broadcast(frame('watcher', body.watcher));
      }
      if (state.down) dropStreams();
      return send(res, 200, { ok: true, scenario: state.scenario, rate: state.rate, down: state.down, simT: state.simT, streams: streams.size, brain: state.brainPreset, brainReads: state.brainReads });
    }
    if (p.startsWith('/api/')) {
      if (state.down) {
        req.socket.destroy(); // a Core that is down refuses everything
        return;
      }
      if (p === '/api/info') return send(res, 200, { name: 'jarvis-core', version: brainData.brain ? '1.1.0' : '1.0.0', apiVersion: 1, mode: 'fixture', scenario: state.scenario, timeZone: state.timeZone, ownerName: 'Frank', uptimeSec: makeStatus(state.scenario, state.simT, state.startT).core.uptimeSec, tailscale: { url: 'https://alienware.tail4b2c1.ts.net/' }, dashboard: { nightDim: '23:00-07:00', ownerName: 'Frank' } });
      // The brain (Core 1.1.0); a 1.0.0 Core answers these with 404 like any unknown route.
      if (p === '/api/brain' && brainData.brain) {
        state.brainReads++;
        return send(res, 200, brainData.brain);
      }
      if (p === '/api/jobs' && brainData.brain) return send(res, 200, { jobs: brainData.jobs.slice(0, Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 50))) });
      if (p === '/api/watchers' && brainData.brain) return send(res, 200, { watchers: brainData.watchers });
      if (p === '/api/briefing' && brainData.brain) return brainData.briefing ? send(res, 200, brainData.briefing) : send(res, 404, { error: 'none_yet', message: 'There is no briefing yet.' });
      if (p === '/api/status') return send(res, 200, status());
      if (p === '/api/history') return send(res, 200, makeHistory(state.scenario, state.simT, 900));
      if (p === '/api/events') {
        const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 50));
        const list = events.slice(-limit).reverse(); // newest first, like the Core
        return send(res, 200, { events: list, total: events.length, latestId: events.length ? events[events.length - 1].id : null });
      }
      if (p === '/api/fixture') {
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (!SCENARIOS.includes(body.scenario)) return send(res, 400, { error: 'bad_scenario' });
          if (body.scenario !== state.scenario) setScenario(body.scenario);
        }
        return send(res, 200, { scenario: state.scenario, scenarios: SCENARIOS });
      }
      if (p === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
        res.write('retry: 3000\n\n');
        res.write(frame('status', status()));
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
      if (p === '/api/ask' && req.method === 'POST') {
        const body = await readBody(req);
        state.asks++;
        return send(res, 200, mockAnswer(body.q, status()));
      }
      return send(res, 404, { error: 'not found' });
    }
    return serveStatic(req, res, p);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      if (!quiet) console.log(`Mock Core on http://127.0.0.1:${server.address().port}/ (scenario ${state.scenario}, ${state.rate}/s)`);
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        state,
        async control(body) {
          const res = await fetch(`http://127.0.0.1:${server.address().port}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          return res.json();
        },
        close() {
          clearInterval(timer);
          dropStreams();
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
  };
  startMockCore({
    port: Number(opt('port', 8790)),
    scenario: opt('scenario', 'ok'),
    rate: Number(opt('rate', 1)),
    start: Date.parse(opt('start', '2026-11-25T21:47:00Z')),
    brain: opt('brain', 'none'),
    timeZone: opt('tz', 'UTC'),
    quiet: false,
  });
}
