#!/usr/bin/env node
// The home base brain on the kiosk: screenshots and layout checks of morning mode and of the system
// report with the brain's panels, against the stand-in Core (mock-server.mjs) with a brain preset
// (brain-fixtures.mjs). The page is loaded from localhost, so it is the kiosk.
//
//   node core/dashboard/test/morning-screenshots.mjs [--out DIR] [--only morning-ok,report-ok] [--sizes 1920x1080]
//
// Shots (name: scenario, brain preset, simulated time):
//   morning-ok         the briefing with weather and a key, 07:05
//   morning-noweather  no location set yet: the calm hint instead of the weather
//   morning-nokey      no key: the one line about giving the home base the key
//   morning-long       a long headline list
//   morning-full       the full briefing (written by Claude): its lead paragraph
//   morning-waiting    07:00 and no briefing yet: the greeting with the time, the date and the state;
//                      then a briefing arrives over the stream and shows at once (checked)
//   morning-alert      the alert scenario: the strip keeps the health in sight
//   report-ok | report-warn | report-alert   the system report with the brain's panels, 21:47
//   report-nokey | report-overcap | report-sdk | report-busy
//   report-nobrain     an old Core (api/brain answers 404): no brain UI at all
// Morning shots also check that a key press returns to the system report and the kiosk's night
// dim is lifted while the morning shows (a 06:30 briefing inside the 23:00–07:00 dim).

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutProblems, loadPlaywright } from './screenshots.mjs';
import { startMockCore } from './mock-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const SHOTS = {
  'morning-ok': { scenario: 'ok', brain: 'ok', at: '2026-11-25T07:05:00Z', morning: true },
  'morning-noweather': { scenario: 'ok', brain: 'noweather', at: '2026-11-25T07:05:00Z', morning: true },
  'morning-nokey': { scenario: 'ok', brain: 'nokey', at: '2026-11-25T07:05:00Z', morning: true },
  'morning-long': { scenario: 'ok', brain: 'long', at: '2026-11-25T07:05:00Z', morning: true },
  'morning-full': { scenario: 'ok', brain: 'full', at: '2026-11-25T07:05:00Z', morning: true },
  'morning-waiting': { scenario: 'ok', brain: 'waiting', at: '2026-11-25T07:00:10Z', morning: true, arrive: true },
  'morning-alert': { scenario: 'alert', brain: 'ok', at: '2026-11-25T07:05:00Z', morning: true },
  'report-ok': { scenario: 'ok', brain: 'ok', at: '2026-11-25T21:47:00Z' },
  'report-warn': { scenario: 'warn', brain: 'ok', at: '2026-11-25T21:47:00Z' },
  'report-alert': { scenario: 'alert', brain: 'busy', at: '2026-11-25T21:47:00Z' },
  'report-nokey': { scenario: 'ok', brain: 'nokey', at: '2026-11-25T21:47:00Z' },
  'report-overcap': { scenario: 'ok', brain: 'overcap', at: '2026-11-25T21:47:00Z' },
  'report-sdk': { scenario: 'ok', brain: 'sdk', at: '2026-11-25T21:47:00Z' },
  'report-busy': { scenario: 'ok', brain: 'busy', at: '2026-11-25T21:47:00Z' },
  'report-nobrain': { scenario: 'ok', brain: 'none', at: '2026-11-25T21:47:00Z' },
};

function parseArgs(argv) {
  const o = { out: path.join(HERE, 'artifacts', 'morning'), only: null, sizes: ['1920x1080'] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--out') o.out = path.resolve(next());
    else if (a === '--only') o.only = next().split(',');
    else if (a === '--sizes') o.sizes = next().split(',');
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

/** Morning-screen checks: nothing cut off or spilling out, the strip on one line, the dim lifted. */
async function morningProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const m = document.getElementById('morning');
    if (!m || m.hidden) return ['the morning screen is not showing'];
    if (document.documentElement.dataset.night === 'on') out.push('the night dim is on over the morning screen');
    if (m.scrollHeight > m.clientHeight + 1) out.push(`the morning screen is too tall by ${m.scrollHeight - m.clientHeight}px`);
    for (const c of m.querySelectorAll('.m-card, .m-waiting, .m-hero, .m-strip, .m-foot')) {
      if (c.hidden || c.closest('[hidden]')) continue;
      if (c.scrollHeight > c.clientHeight + 1) out.push(`${c.id || c.className} content cut off: ${c.scrollHeight - c.clientHeight}px too tall`);
      if (c.scrollWidth > c.clientWidth + 1) out.push(`${c.id || c.className} content cut off: ${c.scrollWidth - c.clientWidth}px too wide`);
    }
    for (const t of m.querySelectorAll('.m-greeting, .m-vital b, .m-wx-now, .m-wx-range, .m-temp, .clock, .state-word')) {
      if (t.closest('[hidden]')) continue;
      if (t.scrollWidth > t.clientWidth + 1) out.push(`text cut: ${t.id || t.className} "${t.textContent}"`);
    }
    // The strip on one line: its parts side by side (the page scales with the screen, so no fixed height).
    const parts = [...m.querySelector('.m-strip').children].map((c) => c.getBoundingClientRect()).filter((r) => r.height);
    const mid = (r) => r.top + r.height / 2;
    if (parts.some((r) => Math.abs(mid(r) - mid(parts[0])) > r.height / 2)) out.push('the strip wraps onto two lines');
    // Every card's last item must end inside the card (a line-clamped title is fine; a whole item under the edge is not).
    for (const card of m.querySelectorAll('.m-card')) {
      if (card.closest('[hidden]')) continue;
      const box = card.getBoundingClientRect();
      for (const li of card.querySelectorAll('li, p')) {
        if (li.closest('[hidden]')) continue;
        const r = li.getBoundingClientRect();
        if (r.height && r.bottom > box.bottom - 2) out.push(`${card.id}: "${li.textContent.slice(0, 40)}…" runs past the card's bottom`);
      }
    }
    return out;
  });
}

/** The system report's brain panels: shown with a brain, absent without one, nothing cut. */
async function brainProblems(page, preset) {
  return page.evaluate((preset) => {
    const out = [];
    const has = document.documentElement.dataset.brain === 'on';
    const strip = document.getElementById('p-brain');
    const missions = document.getElementById('p-missions');
    if (preset === 'none') {
      if (has || !strip.hidden || !missions.hidden) out.push('brain UI shows with an old Core (no brain)');
      if (document.querySelector('.tabs button')) out.push('tabs show with an old Core');
      return out;
    }
    if (!has || strip.hidden) out.push('the HOME BASE strip is missing');
    for (const t of document.querySelectorAll('.bc-word, .bc-usd, .bc-count, .mission-when, .mission-status, .tab')) {
      if (t.closest('[hidden]') || !t.offsetParent) continue;
      if (t.scrollWidth > t.clientWidth + 1) out.push(`text cut: ${t.id || t.className} "${t.textContent}"`);
    }
    // The pieces of a panel's header (the title, the tabs, the chip) side by side, never on top of each other.
    for (const head of document.querySelectorAll('.panel-head')) {
      if (head.closest('[hidden]') || !head.offsetParent) continue;
      const parts = [...head.querySelectorAll(':scope > h2, :scope > .tabs > .tab, :scope > .chip')].filter((p) => p.offsetParent).map((p) => [p.textContent.trim(), p.getBoundingClientRect()]);
      for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++) {
          const [ta, a] = parts[i];
          const [tb, b] = parts[j];
          if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) out.push(`header pieces overlap: "${ta}" and "${tb}"`);
        }
      if (head.scrollWidth > head.clientWidth + 1) out.push(`${head.parentElement.id} header runs out of its panel`);
    }
    const key = document.getElementById('bc-key-text').textContent;
    if (preset === 'nokey' && !/Add your key from Jarvis on your phone/.test(key)) out.push(`no key, but the key line says "${key}"`);
    if (preset === 'sdk' && !/Run jarvis-core update/.test(key)) out.push(`SDK missing, but the key line says "${key}"`);
    if (preset === 'overcap' && document.getElementById('bc-spend').dataset.level !== 'alert') out.push('over the cap, but the spend is not red');
    return out;
  }, preset);
}

async function shoot({ browser, name, size, outDir }) {
  const spec = SHOTS[name];
  const [w, h] = size.split('x').map(Number);
  const core = await startMockCore({ port: 0, scenario: spec.scenario, rate: 1, start: Date.parse(spec.at), brain: spec.brain, timeZone: 'UTC' });
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'dark' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  try {
    // A briefing time inside the night dim (06:30) for the morning shots: the dim must lift.
    await page.goto(`${core.url}?nosw&dim=23:00-07:30`);
    await page.waitForFunction(() => window.__jarvisCore && window.__jarvisCore.stats().online, null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    if (spec.morning) {
      await page.waitForFunction(() => window.__jarvisCore.stats().morning, null, { timeout: 8000 }).catch(() => problems.push('morning mode did not start'));
      if (spec.arrive) {
        await page.waitForTimeout(2500);
        const waitFile = path.join(outDir, `${name}-${size}.png`);
        problems.push(...(await morningProblems(page)));
        await page.screenshot({ path: waitFile });
        // A briefing arrives over the stream (the Core's `briefing` frame): it shows at once.
        await core.control({ briefing: true });
        await page.waitForFunction(() => document.getElementById('morning').dataset.state === 'briefing', null, { timeout: 5000 }).catch(() => problems.push('a briefing that arrived over the stream did not show'));
        await page.waitForTimeout(2500);
        const arrived = path.join(outDir, `${name}-arrived-${size}.png`);
        problems.push(...(await morningProblems(page)));
        await page.screenshot({ path: arrived });
        return { files: [waitFile, arrived], problems: [...problems, ...(await layoutProblems(page))] };
      }
      await page.waitForTimeout(3000); // the morning rises in
      problems.push(...(await morningProblems(page)));
      const file = path.join(outDir, `${name}-${size}.png`);
      await page.screenshot({ path: file });
      // A key press returns to the system report; the key does not start a question.
      await page.keyboard.press('KeyA');
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({ morning: window.__jarvisCore.stats().morning, input: document.getElementById('ask-input').value, hidden: document.getElementById('morning').hidden }));
      if (after.morning || !after.hidden) problems.push('a key press did not return to the system report');
      if (after.input) problems.push(`the key that closed the morning screen went into the question box ("${after.input}")`);
      problems.push(...(await layoutProblems(page)), ...(await brainProblems(page, spec.brain)));
      const report = path.join(outDir, `${name}-after-key-${size}.png`);
      await page.screenshot({ path: report });
      return { files: [file, report], problems };
    }
    await page.waitForTimeout(2500);
    const stats = await page.evaluate(() => window.__jarvisCore.stats());
    if (stats.morning) problems.push('morning mode shows outside the morning');
    problems.push(...(await layoutProblems(page)), ...(await brainProblems(page, spec.brain)));
    const file = path.join(outDir, `${name}-${size}.png`);
    await page.screenshot({ path: file });
    return { files: [file], problems };
  } finally {
    await context.close();
    await core.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await mkdir(opts.out, { recursive: true });
  const pw = await loadPlaywright();
  const names = opts.only || Object.keys(SHOTS);
  const browser = await pw.chromium.launch();
  let failed = 0;
  try {
    for (const name of names) {
      if (!SHOTS[name]) throw new Error(`unknown shot ${name} (${Object.keys(SHOTS).join(', ')})`);
      for (const size of opts.sizes) {
        const r = await shoot({ browser, name, size, outDir: opts.out });
        if (r.problems.length) failed++;
        console.log(`${(r.problems.length ? 'PROBLEMS' : 'ok').padEnd(8)} ${`${name}-${size}`.padEnd(30)} ${r.files.join('  ')}`);
        for (const p of r.problems) console.log(`         - ${p}`);
      }
    }
  } finally {
    await browser.close();
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
