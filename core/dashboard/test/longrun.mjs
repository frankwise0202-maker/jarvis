#!/usr/bin/env node
// The long-run check: the dashboard against the stand-in Core at accelerated time, first until
// everything bounded is full (the event log's 40 rows and the transcript's 6 exchanges), then for
// at least 48 more simulated hours, with a verdict on growth.
//
//   nice -n 10 node core/dashboard/test/longrun.mjs [--hours 48] [--rate 200] [--json out.json]
//
// The mock Core streams one snapshot per simulated second at --rate snapshots per real second
// (200: a day in about seven minutes, 200 times the real load on the page), cycling the scenarios
// ok → warn → alert → nogpu every two simulated hours, adding an event every ten simulated
// minutes, and going offline for a few seconds every six simulated hours. The page's wall clock
// follows the simulated clock (night dim at 23:00, the pixel shift, minute ticks, the transcript's
// quiet clear), a question is asked every two real seconds in turn by filling the box, typing with
// a correction, typing anywhere on the page, a suggestion chip, and typing then Escape; the daily
// refresh is off (?refresh=off) so the page is never reloaded: any growth would show.
//
// Every simulated hour, on a quiet page (the stand-in drops to real time for two seconds) and after
// three forced garbage collections (Chrome DevTools Protocol HeapProfiler.collectGarbage): nodes in
// the live document (a tree walk), every DOM node alive in
// the renderer (CDP Nodes: detached ones too), the JS heap, event listeners; plus layout objects
// and the renderer's RSS for information. The verdict (test/growth.mjs) looks only at the
// measured window after the warm-up: least-squares slope per day and second-half-minus-first-half
// drift for each of the four, within fixed limits. One Chromium; run under `nice -n 10`.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeGrowth } from './growth.mjs';
import { startMockCore } from './mock-server.mjs';
import { loadPlaywright } from './screenshots.mjs';

const START = Date.parse('2026-11-25T06:00:00Z'); // morning, evening, night dim, morning, …
const HOUR = 3600 * 1000;
const SCENARIO_CYCLE = ['ok', 'warn', 'alert', 'nogpu'];
const QUESTIONS = ['How are you?', 'Anything wrong?', 'GPU temp?', 'Status report', 'thanks', 'how hot is the cpu', 'is the internet working'];
const WAYS = ['fill', 'type', 'anywhere', 'chip', 'escape'];
const MAX_EVENTS = 40;
const MAX_MESSAGES = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const opt = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
  };
  return {
    hours: Number(opt('hours', 48)), // measured after the warm-up
    rate: Number(opt('rate', 200)),
    maxWarmup: Number(opt('max-warmup', 16)), // simulated hours allowed to fill the bounded things
    json: opt('json', null),
  };
}

/** RSS (MB) of the Chromium renderer processes, from /proc (Linux); information only. */
function rendererRssMB() {
  let kb = 0;
  for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!cmd.includes('--type=renderer') || !/chrom/i.test(cmd)) continue;
      const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
      if (m) kb += Number(m[1]);
    } catch {
      /* the process ended */
    }
  }
  return +(kb / 1024).toFixed(1);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
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
    // Measure a quiet page: the stand-in Core drops to real time for a moment and any answer in
    // flight lands, so the count is what the page keeps, not the frames it is in the middle of
    // drawing. Then three full collections (V8 and the DOM's heap together) with pauses, so the
    // DOM nodes the previous one found dead are swept before CDP counts them.
    await mock.control({ rate: 1 });
    await sleep(1500);
    for (let i = 0; i < 3; i++) {
      await cdp.send('HeapProfiler.collectGarbage');
      await sleep(250);
    }
    const heap = await cdp.send('Runtime.getHeapUsage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    const stats = await page.evaluate(() => window.__jarvisCore.stats());
    // Nodes in the live document (elements, text, comments; shadow trees excluded) vs. every Node
    // object alive (CDP): a gap that grows means detached nodes are being kept alive somewhere.
    const liveNodes = await page.evaluate(() => {
      const w = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
      let n = 1;
      while (w.nextNode()) n++;
      return n;
    });
    if (!downNow) await mock.control({ rate: opts.rate });
    return {
      simHour,
      liveNodes,
      nodes: m.Nodes,
      heapMB: +(heap.usedSize / 1048576).toFixed(3),
      listeners: m.JSEventListeners,
      layoutObjects: m.LayoutObjects,
      documents: m.Documents,
      rssMB: rendererRssMB(),
      events: stats.events,
      messages: stats.messages,
      streamMessages: stats.client.messages,
      reconnects: stats.client.reconnects,
      night: stats.night,
      orbFrames: stats.orb.frames,
    };
  }

  /**
   * One question, asked one of five ways in turn (the box must end up empty every time). Clicks
   * skip Playwright's "stable" wait: at 200x the pixel shift glides the whole page every second.
   */
  async function askOnce(k) {
    const q = QUESTIONS[k % QUESTIONS.length];
    const way = WAYS[k % WAYS.length];
    if (way === 'fill') {
      await page.fill('#ask-input', q);
      await page.press('#ask-input', 'Enter');
    } else if (way === 'type') {
      await page.click('#ask-input', { force: true });
      await page.keyboard.type(`${q}x`);
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Enter');
    } else if (way === 'anywhere') {
      await page.locator('#ask-input').blur();
      await page.keyboard.type(q); // the first key lands in the box, the rest follow it there
      await page.keyboard.press('Enter');
    } else if (way === 'chip') {
      await page.click(`.ask-chip >> nth=${k % 4}`, { force: true });
    } else {
      await page.click('#ask-input', { force: true });
      await page.keyboard.type('never mind');
      await page.keyboard.press('Escape');
    }
    return way;
  }

  const samples = [];
  const t0 = Date.now();
  await mock.control({ rate: opts.rate });
  let lastHour = -1;
  let lastAsk = 0;
  let asks = 0;
  let outages = 0;
  let warmupHour = null;
  let boxLeftFull = 0;
  for (;;) {
    const simMs = mock.state.simT - START;
    const simHour = Math.floor(simMs / HOUR);
    if (warmupHour !== null && simHour > warmupHour + opts.hours) break;
    if (warmupHour === null && simHour > opts.maxWarmup) break;
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
      await askOnce(asks++);
      if ((await page.inputValue('#ask-input')) !== '') boxLeftFull++;
    }
    if (simHour !== lastHour) {
      lastHour = simHour;
      const s = await measure(simHour);
      if (warmupHour === null && s.events >= MAX_EVENTS && s.messages >= MAX_MESSAGES) warmupHour = simHour;
      s.hour = warmupHour === null ? null : simHour - warmupHour; // hours into the measured window
      samples.push(s);
      const tag = s.hour === null ? 'warm-up' : `+${String(s.hour).padStart(2, '0')}h`;
      console.log(`h${String(simHour).padStart(2, '0')} ${tag.padEnd(7)} live ${s.liveNodes}  nodes ${s.nodes}  heap ${s.heapMB.toFixed(2)} MB  listeners ${s.listeners}  layout ${s.layoutObjects}  rss ${s.rssMB} MB  events ${s.events}  msgs ${s.messages}  night ${s.night}  reconnects ${s.reconnects}`);
    }
    await sleep(250);
  }
  const realS = Math.round((Date.now() - t0) / 1000);
  const final = samples[samples.length - 1];

  // Chrome's own undo history for the question box (blink::UndoStep objects, visible when the
  // build names its C++ objects in heap snapshots, as Playwright's Chromium does).
  let undoSteps = null;
  try {
    const chunks = [];
    cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    const snap = JSON.parse(chunks.join(''));
    const nf = snap.snapshot.meta.node_fields.length;
    const ni = snap.snapshot.meta.node_fields.indexOf('name');
    let named = false;
    let count = 0;
    for (let i = 0; i < snap.nodes.length; i += nf) {
      const nm = snap.strings[snap.nodes[i + ni]];
      if (nm.startsWith('blink::')) named = true;
      if (nm === 'blink::UndoStep') count++;
    }
    undoSteps = named ? count : null;
  } catch {
    /* information only */
  }

  await browser.close();
  await mock.close();

  const measured = samples.filter((s) => s.hour !== null);
  const growth = judgeGrowth(measured);
  const problems = [...growth.failures];
  if (warmupHour === null) problems.push(`the event log and transcript were not full after ${opts.maxWarmup} simulated hours`);
  if (warmupHour !== null && growth.hours < opts.hours) problems.push(`only ${growth.hours} hours measured after the warm-up`);
  if (navigations !== 1) problems.push(`the page reloaded ${navigations - 1} time(s)`);
  if (errors.length) problems.push(`${errors.length} page error(s)`);
  if (boxLeftFull) problems.push(`the question box was left with text ${boxLeftFull} time(s)`);
  if (measured.some((s) => s.events > MAX_EVENTS || s.messages > MAX_MESSAGES)) problems.push('the event log or the transcript went past its bound');
  if (undoSteps !== null && undoSteps > 5) problems.push(`Chrome kept ${undoSteps} undo steps for the question box`);
  const pass = problems.length === 0;

  const result = {
    pass,
    problems,
    simulatedHours: final ? final.simHour : 0,
    warmupHours: warmupHour,
    measuredHours: growth.hours,
    rate: opts.rate,
    realSeconds: realS,
    snapshots: final ? final.streamMessages : 0,
    questionsAsked: asks,
    outages,
    navigations: navigations - 1,
    undoSteps,
    errors,
    growth: growth.metrics,
    rendererRssMB: measured.length ? { first: measured[0].rssMB, last: measured[measured.length - 1].rssMB, min: Math.min(...measured.map((s) => s.rssMB)), max: Math.max(...measured.map((s) => s.rssMB)) } : null,
    samples,
  };
  if (opts.json) writeFileSync(opts.json, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, samples: undefined }, null, 2));
  console.log(pass ? `PASS: nothing grows over ${growth.hours} simulated hours after the warm-up` : `FAIL: ${problems.join('; ')}`);
  process.exitCode = pass ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
