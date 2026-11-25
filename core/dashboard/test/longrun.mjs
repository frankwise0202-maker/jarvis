#!/usr/bin/env node
// The long-run check: a simulated day at accelerated time, then a verdict on memory growth.
//
//   nice -n 10 node core/dashboard/test/longrun.mjs [--hours 24] [--rate 200] [--json out.json]
//
// The mock Core streams one snapshot per simulated second at --rate snapshots per real second
// (200: a day in about seven minutes, 200 times the real load on the page), cycling the scenarios
// ok → warn → alert → nogpu every two simulated hours, adding an event every ten simulated
// minutes, and going offline for a few seconds every six simulated hours. The page's wall clock
// follows the simulated clock (night dim at 23:00, the pixel shift, minute ticks), the assistant is
// asked a question every two real seconds, and the daily refresh is off (?refresh=off) so the page
// is never reloaded: any growth would show.
//
// Measured once per simulated hour after a forced garbage collection (Chrome DevTools Protocol):
// JS heap used, DOM nodes, event listeners, layout objects, documents; plus the renderer's RSS.
// Pass: after an eight-hour warm-up (the event log fills to its 40 rows at one event per ten
// simulated minutes; the rings and the transcript fill sooner) the heap stays within 2 MB with no
// upward trend, and nodes and listeners are flat. One Chromium; run under `nice -n 10`.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockCore } from './mock-server.mjs';
import { loadPlaywright } from './screenshots.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const HOURS = Number(opt('hours', 24));
const RATE = Number(opt('rate', 200));
const JSON_OUT = opt('json', null);
const START = Date.parse('2026-11-25T06:00:00Z'); // a whole day: morning, evening, night dim, morning
const HOUR = 3600 * 1000;
const SCENARIO_CYCLE = ['ok', 'warn', 'alert', 'nogpu'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** RSS (kB) of the Chromium renderer processes, from /proc (Linux). */
function rendererRssKb() {
  let total = 0;
  for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!cmd.includes('--type=renderer') || !/chrom/i.test(cmd)) continue;
      const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
      if (m) total += Number(m[1]);
    } catch {
      /* the process ended */
    }
  }
  return total;
}

/** Least-squares slope of y over x (per unit of x). */
function slope(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}

async function main() {
  const pw = await loadPlaywright();
  const mock = await startMockCore({ port: 0, scenario: 'ok', rate: 1, start: START });
  const browser = await pw.chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  const errors = [];
  let navigations = 0;
  let downNow = false;
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !(downNow && /Failed to load resource|ERR_/.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations++;
  });

  await page.clock.setSystemTime(START);
  await page.goto(`${mock.url}?refresh=off`);
  await page.waitForFunction(() => window.__jarvisCore && window.__jarvisCore.stats().online, null, { timeout: 15000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  async function measure(simHour) {
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(200);
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    const stats = await page.evaluate(() => window.__jarvisCore.stats());
    // Nodes in the live document (elements, text, comments) vs. every Node object alive (CDP): a
    // gap that grows means detached nodes are being kept alive somewhere.
    const live = await page.evaluate(() => {
      const w = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
      let n = 1;
      while (w.nextNode()) n++;
      return n;
    });
    return {
      liveNodes: live,
      simHour,
      heapMB: +(heap.usedSize / 1048576).toFixed(3),
      nodes: m.Nodes,
      listeners: m.JSEventListeners,
      layoutObjects: m.LayoutObjects,
      documents: m.Documents,
      rssMB: +(rendererRssKb() / 1024).toFixed(1),
      events: stats.events,
      messages: stats.messages,
      streamMessages: stats.client.messages,
      reconnects: stats.client.reconnects,
      night: stats.night,
      orbFrames: stats.orb.frames,
    };
  }

  const samples = [];
  const t0 = Date.now();
  await mock.control({ rate: RATE });
  let lastHour = -1;
  let lastAsk = 0;
  let asks = 0;
  let outages = 0;
  const questions = ['How are you?', 'Anything wrong?', 'GPU temp?', 'Status report', 'thanks'];
  for (;;) {
    const simMs = mock.state.simT - START;
    const simHour = Math.floor(simMs / HOUR);
    if (simHour >= HOURS) break;
    // The page's wall clock follows the simulated one (night dim, pixel shift, minute ticks).
    await page.clock.setSystemTime(mock.state.simT);
    // Scenario cycle and outages.
    const scenario = SCENARIO_CYCLE[Math.floor(simHour / 2) % SCENARIO_CYCLE.length];
    if (mock.state.scenario !== scenario && !downNow) await mock.control({ scenario });
    if (simHour > 0 && simHour % 6 === 0 && simMs % (6 * HOUR) < 30 * 60000 && !downNow && outages < Math.floor(simHour / 6)) {
      outages++;
      downNow = true;
      await mock.control({ down: true });
      await sleep(7000); // long enough for the watchdog to call it offline
      await mock.control({ down: false });
      await page.waitForFunction(() => window.__jarvisCore.stats().online, null, { timeout: 30000 });
      downNow = false;
    }
    if (Date.now() - lastAsk > 2000) {
      lastAsk = Date.now();
      const q = questions[asks++ % questions.length];
      await page.fill('#ask-input', q);
      await page.press('#ask-input', 'Enter');
    }
    if (simHour !== lastHour) {
      lastHour = simHour;
      const s = await measure(simHour);
      samples.push(s);
      console.log(`h${String(simHour).padStart(2, '0')}  heap ${s.heapMB.toFixed(2)} MB  nodes ${s.nodes} (live ${s.liveNodes})  listeners ${s.listeners}  layout ${s.layoutObjects}  rss ${s.rssMB} MB  events ${s.events}  msgs ${s.messages}  night ${s.night}  stream ${s.streamMessages}  reconnects ${s.reconnects}`);
    }
    await sleep(250);
  }
  const final = await measure(HOURS);
  samples.push(final);
  const realS = (Date.now() - t0) / 1000;
  console.log(`h${HOURS}  heap ${final.heapMB.toFixed(2)} MB  nodes ${final.nodes}  listeners ${final.listeners}  rss ${final.rssMB} MB  (end)`);

  await browser.close();
  await mock.close();

  // Verdict: after the warm-up (rings, event log and transcript reach their bounds) nothing grows.
  const WARMUP_H = Math.min(8, Math.max(0, HOURS - 4));
  const steady = samples.filter((s) => s.simHour >= WARMUP_H);
  const heaps = steady.map((s) => s.heapMB);
  const heapRange = Math.max(...heaps) - Math.min(...heaps);
  const heapSlopePerDay = slope(steady.map((s) => s.simHour), heaps) * 24;
  const nodeRange = Math.max(...steady.map((s) => s.nodes)) - Math.min(...steady.map((s) => s.nodes));
  const listenerRange = Math.max(...steady.map((s) => s.listeners)) - Math.min(...steady.map((s) => s.listeners));
  const rss = steady.map((s) => s.rssMB);
  const result = {
    simulatedHours: HOURS,
    warmupHours: WARMUP_H,
    realSeconds: Math.round(realS),
    rate: RATE,
    snapshots: final.streamMessages,
    questionsAsked: asks,
    outages,
    navigations: navigations - 1,
    errors,
    heapMB: { first: heaps[0], last: heaps[heaps.length - 1], min: Math.min(...heaps), max: Math.max(...heaps), range: +heapRange.toFixed(3), slopePerDay: +heapSlopePerDay.toFixed(3) },
    nodes: { min: Math.min(...steady.map((s) => s.nodes)), max: Math.max(...steady.map((s) => s.nodes)), range: nodeRange },
    listeners: { range: listenerRange },
    rendererRssMB: { first: rss[0], last: rss[rss.length - 1], min: Math.min(...rss), max: Math.max(...rss) },
    samples,
  };
  const pass = heapRange < 2 && heapSlopePerDay < 1 && nodeRange <= 80 && listenerRange <= 10 && navigations === 1 && errors.length === 0;
  result.pass = pass;
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, samples: undefined }, null, 2));
  console.log(pass ? 'PASS: no growth over the simulated day' : 'FAIL');
  process.exitCode = pass ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
