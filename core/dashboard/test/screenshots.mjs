#!/usr/bin/env node
// Screenshots of the 24/7 dashboard with fixture data, for looking at (SPEC: "look at them and
// iterate until it is clearly a Jarvis-grade system report"), plus layout checks that fail loudly:
// no page scrolling, no panel whose content is cut off, no console errors or CSP violations.
//
//   node core/dashboard/test/screenshots.mjs [--out DIR] [--only ok,warn] [--sizes 1920x1080,1366x768] [--mock]
//
// By default each shot runs against the real Core in fixture mode (core/server/main.mjs --fixture
// <scenario> --start <time>, a fresh process per shot, in memory only); --mock uses the stand-in
// (test/mock-server.mjs) instead. Shots: ok, warn, alert, nogpu, internet (the Core's `offline`
// fixture: the internet is down), offline (the Core itself stops: its process is killed after the
// page has loaded), night (ok at 23:31, dimmed). The dashboard follows the Core's clock, so the
// simulated time drives the clock and night dim. One Chromium at a time; run under `nice -n 10`.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockCore } from './mock-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_MAIN = path.resolve(HERE, '../../server/main.mjs');

/** The real Core in fixture mode on a free port; resolves once it answers. */
export function startRealCore({ scenario = 'ok', start = '2026-11-25T21:47:00', timeScale = 1, extraArgs = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CORE_MAIN, '--fixture', scenario, '--start', start, '--time-scale', String(timeScale), '--port', '0', '--no-persist', ...extraArgs], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => reject(new Error(`the Core did not start:\n${out}`)), 20000);
    const onData = (d) => {
      out += d;
      const m = /running at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out);
      if (m) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        const url = m[1];
        resolve({
          url,
          child,
          async control(body) {
            if (body.scenario) await fetch(new URL('api/fixture', url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: body.scenario }) });
            if (body.down === true) child.kill('SIGTERM');
            return {};
          },
          close() {
            return new Promise((r) => {
              if (child.exitCode !== null || child.signalCode) return r();
              child.once('exit', () => r());
              child.kill('SIGTERM');
            });
          },
        });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => {
      out += d;
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (!/running at/.test(out)) reject(new Error(`the Core exited (${code}):\n${out}`));
    });
  });
}

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    /* fall through */
  }
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    /* fall through */
  }
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return require(path.join(globalRoot, 'playwright'));
}

function parseArgs(argv) {
  const o = { out: path.join(HERE, 'artifacts'), only: null, sizes: ['1920x1080', '2560x1440', '1366x768'], mock: false, ask: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--out') o.out = path.resolve(next());
    else if (a === '--only') o.only = next().split(',');
    else if (a === '--sizes') o.sizes = next().split(',');
    else if (a === '--mock') o.mock = true;
    else if (a === '--no-ask') o.ask = false;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const SIM_START = '2026-11-25T21:47:00';
const NIGHT_START = '2026-11-25T23:31:00';

/** Layout checks inside the page: page scroll, clipped panels, overlapping readouts. */
async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    // The pixel shift moves the whole stage up to 3 px; anything more is real overflow.
    const se = document.scrollingElement;
    if (se.scrollHeight > innerHeight + 4) out.push(`page scrolls vertically (${se.scrollHeight} > ${innerHeight})`);
    if (se.scrollWidth > innerWidth + 4) out.push(`page scrolls horizontally (${se.scrollWidth} > ${innerWidth})`);
    const st = document.getElementById('stage');
    if (st.scrollHeight > st.clientHeight + 1) out.push(`stage content too tall by ${st.scrollHeight - st.clientHeight}px`);
    for (const p of document.querySelectorAll('.panel')) {
      if (p.closest('[hidden]')) continue;
      if (p.scrollHeight > p.clientHeight + 1) out.push(`#${p.id} content cut off: ${p.scrollHeight - p.clientHeight}px too tall`);
      if (p.scrollWidth > p.clientWidth + 1) out.push(`#${p.id} content cut off: ${p.scrollWidth - p.clientWidth}px too wide`);
    }
    // Text that overflows its own box (ellipsis is fine, but values should fit).
    for (const b of document.querySelectorAll('.fig b, .gauge-readout .gv, .meter-val, .fs-pct, .svc-state, .state-word, .clock, .ev-time')) {
      if (b.closest('[hidden]')) continue;
      if (b.scrollWidth > b.clientWidth + 1) out.push(`value cut: #${b.id || b.className} "${b.textContent}"`);
    }
    // Readouts must stay inside the core stage and must not overlap each other or the summary.
    const stage = document.getElementById('core-stage').getBoundingClientRect();
    const boxes = [...document.querySelectorAll('.gauge-readout')].map((n) => [n.id, n.getBoundingClientRect()]);
    for (const [id, r] of boxes) {
      if (r.left < stage.left - 1 || r.right > stage.right + 1 || r.top < stage.top - 1 || r.bottom > stage.bottom + 1) out.push(`${id} outside the core stage`);
    }
    const sum = document.getElementById('core-summary').getBoundingClientRect();
    for (const [id, r] of boxes) if (r.bottom > sum.top + 1 && r.top < sum.bottom && r.right > sum.left && r.left < sum.right && document.getElementById('core-summary').textContent.trim()) out.push(`${id} overlaps the summary line`);
    return out;
  });
}

/**
 * Layout checks with the longest text the page can get, run after the screenshot: the longest event time
 * (every hour over two weeks, in the page's locale, en-US and en-GB) in the log's time column, and a long
 * drive name in each corner caption (a USB drive at /media/<user>/<label>). Nothing the app keeps is
 * replaced: a cloned log row, and the caption's own text node, put back afterwards.
 */
async function longTextProblems(page) {
  return page.evaluate(async () => {
    const out = [];
    const F = await import(new URL('app/format.js', location.href).href);
    const now = Date.now();
    const list = document.querySelector('.ev')?.parentElement;
    if (list) {
      let longest = '';
      for (const loc of [undefined, 'en-US', 'en-GB']) {
        for (let h = 0; h < 24 * 14; h += 1) {
          const s = F.fmtEventTime(now - h * 3600000 - 59 * 60000, now, loc, 'UTC');
          if (s.length > longest.length) longest = s;
        }
      }
      const row = list.querySelector('.ev').cloneNode(true);
      row.querySelector('.ev-time').textContent = longest;
      list.prepend(row);
      const t = row.querySelector('.ev-time');
      const lv = row.querySelector('.ev-level').getBoundingClientRect();
      if (t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().left + t.scrollWidth > lv.left + 1) out.push(`event time "${longest}" runs into the level column`);
      row.remove();
    }
    const stage = document.getElementById('core-stage').getBoundingClientRect();
    for (const sub of document.querySelectorAll('.gauge-readout .gr-sub')) {
      const box = sub.closest('.gauge-readout').getBoundingClientRect();
      let tn = sub.firstChild;
      const made = !tn;
      if (made) tn = sub.appendChild(document.createTextNode(''));
      const old = tn.data;
      tn.data = 'Seagate Expansion Desktop Drive 4TB · 29 MB free';
      const r = sub.getBoundingClientRect();
      const clipped = getComputedStyle(sub).overflowX !== 'visible';
      const right = clipped ? r.right : r.left + sub.scrollWidth;
      if (right > box.right + 1 || right > stage.right + 1 || r.left < stage.left - 1) out.push(`${sub.closest('.gauge-readout').id} caption runs out of its corner (${Math.round(right - box.right)}px)`);
      if (made) tn.remove();
      else tn.data = old;
    }
    return out;
  });
}

/** One shot: a fresh Core (real or stand-in) for the scenario, a fresh browser context. */
async function shoot({ browser, scenario, size, outDir, ask, mock }) {
  const [w, h] = size.split('x').map(Number);
  const night = scenario === 'night';
  const coreScenario = night || scenario === 'offline' ? 'ok' : scenario === 'internet' ? 'offline' : scenario;
  const start = night ? NIGHT_START : SIM_START;
  const core = mock ? await startMockCore({ port: 0, scenario: coreScenario, rate: 1, start: Date.parse(`${start}Z`) }) : await startRealCore({ scenario: coreScenario, start });
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'dark' });
  const page = await context.newPage();
  const problems = [];
  let stopping = false;
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    // Taking the Core down on purpose makes Chrome log the failed requests; nothing else may.
    if (m.type() === 'error' && !(stopping && /Failed to load resource|ERR_/.test(m.text()))) problems.push(`console error: ${m.text()}`);
  });
  try {
    await page.goto(`${core.url}?nosw`);
    await page.waitForFunction(() => window.__jarvisCore && window.__jarvisCore.stats().online, null, { timeout: 15000 });
    await page.waitForTimeout(2500); // the core eases in; sparklines fill from history
    if (ask && !night && scenario !== 'offline') {
      const q = scenario === 'ok' || scenario === 'nogpu' ? 'How are you?' : 'Anything wrong?';
      await page.click(`.ask-chip[data-q="${q}"]`);
      await page.waitForSelector('.msg-core:not(.is-pending)', { timeout: 5000 });
      if (scenario === 'nogpu') {
        await page.click('.ask-chip[data-q="GPU temp?"]');
        await page.waitForFunction(() => document.querySelectorAll('.msg-core:not(.is-pending)').length >= 2);
      }
      await page.mouse.move(w / 2, h / 2); // away from the chips (no hover glow)
      await page.locator('#ask-input').blur();
    }
    if (scenario === 'offline') {
      stopping = true;
      await core.control({ down: true });
      await page.waitForFunction(() => !window.__jarvisCore.stats().online, null, { timeout: 15000 });
      await page.waitForTimeout(3000); // the dimming fades in; the banner counts up
    }
    if (night) {
      await page.waitForFunction(() => document.documentElement.dataset.night === 'on', null, { timeout: 5000 });
      await page.waitForTimeout(9000); // the veil fades in over 8 s
    }
    const layout = await layoutProblems(page);
    const file = path.join(outDir, `${scenario}-${size}.png`);
    await page.screenshot({ path: file });
    const long = scenario === 'offline' ? [] : await longTextProblems(page);
    const stats = await page.evaluate(() => window.__jarvisCore.stats());
    return { file, problems: [...problems, ...layout, ...long], stats };
  } finally {
    await context.close();
    await core.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await mkdir(opts.out, { recursive: true });
  const mock = opts.mock || !existsSync(CORE_MAIN);
  const pw = await loadPlaywright();
  const scenarios = opts.only || ['ok', 'warn', 'alert', 'nogpu', 'internet', 'offline', 'night'];
  const browser = await pw.chromium.launch();
  let failed = 0;
  console.log(`Against ${mock ? 'the stand-in (mock-server.mjs)' : 'the real Core in fixture mode (core/server/main.mjs)'}`);
  try {
    for (const scenario of scenarios) {
      const sizes = scenario === 'night' ? ['1920x1080'] : opts.sizes;
      for (const size of sizes) {
        const r = await shoot({ browser, scenario, size, outDir: opts.out, ask: opts.ask, mock });
        const status = r.problems.length ? 'PROBLEMS' : 'ok';
        if (r.problems.length) failed++;
        console.log(`${status.padEnd(8)} ${r.file}  nodes=${r.stats.nodes} R=${Math.round(r.stats.orb.R)}`);
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
