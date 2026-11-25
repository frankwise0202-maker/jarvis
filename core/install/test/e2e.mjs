// End to end on this machine: the real Core on the real /proc (live) and in fixture mode, the dashboard
// in Chromium, questions typed and clicked into the status assistant, screenshots of each.
//
//   flock /tmp/jarvis-scratch/core/browser.lock nice -n 10 node core/install/test/e2e.mjs --out <dir>
//
// Prints every question and answer and fails on console errors, unanswered questions or an answer
// from the wrong intent.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../../dashboard/test/screenshots.mjs';
import { freePort } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.resolve(here, '../../server/main.mjs');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(here, 'artifacts', 'e2e');
fs.mkdirSync(OUT, { recursive: true });

function startCore(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => reject(new Error(`the Core did not start:\n${out}`)), 30_000);
    const onData = (d) => {
      out += d;
      if (/running at/.test(out)) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => reject(new Error(`the Core exited (${code}):\n${out}`)));
  });
}

async function ask(page, q, how) {
  const before = await page.locator('#transcript li.msg-core').count();
  if (how === 'chip') {
    await page.locator(`#ask-chips .ask-chip[data-q="${q}"]`).click();
  } else {
    await page.locator('#ask-input').fill(q);
    await page.locator('#ask-input').press('Enter');
  }
  const answer = page.locator('#transcript li.msg-core').nth(before);
  await answer.waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForFunction((i) => {
    const li = document.querySelectorAll('#transcript li.msg-core')[i];
    return li && !li.classList.contains('is-pending') && li.textContent.trim().length > 0;
  }, before, { timeout: 10_000 });
  return (await answer.innerText()).trim();
}

async function run() {
  const { chromium } = await loadPlaywright();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jcore-e2e-'));
  const livePort = await freePort();
  const fixturePort = await freePort();
  const live = await startCore(['--port', String(livePort), '--data-dir', dataDir]);
  const fixture = await startCore(['--fixture', 'ok', '--port', String(fixturePort)]);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const problems = [];
  const transcript = [];
  try {
    const plans = [
      {
        name: 'live', port: livePort, questions: [
          ['How are you?', 'chip', /./],
          ['GPU temp?', 'chip', /driver|GPU|graphics/i],
          ['how much ram is free', 'type', /memory|GB/i],
          ['how full is the hard drive', 'type', /full|free|drive/i],
          ['whats the cpu temprature', 'type', /CPU|processor|°C|sensor/i],
          ['is the internet working', 'type', /internet/i],
          ['can you reach claude?', 'type', /api\.anthropic\.com|Claude|reach/i],
          ['is my iphone connected', 'type', /Tailscale|iPhone/i],
          ['how long have you been up', 'type', /up|since/i],
          ['restart the computer', 'type', /can't|only report/i],
        ],
      },
      {
        name: 'fixture-ok', port: fixturePort, questions: [
          ['How are you?', 'chip', /All systems normal/],
          ['Anything wrong?', 'chip', /nothing|all clear|no (problems|warnings)|normal/i],
          ['Status report', 'chip', /report/i],
          ['hotter than usual?', 'type', /usual|average/i],
          ['which devices are online', 'type', /iPhone/i],
          ['thanks', 'type', /welcome/i],
        ],
      },
    ];
    for (const plan of plans) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`${plan.name}: console error: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`${plan.name}: page error: ${e.message}`));
      await page.goto(`http://127.0.0.1:${plan.port}/?nosw`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.health && document.documentElement.dataset.health !== 'offline', null, { timeout: 20_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, `${plan.name}-1-start.png`) });
      let n = 0;
      for (const [q, how, expect] of plan.questions) {
        const a = await ask(page, q, how);
        transcript.push({ core: plan.name, q, a });
        console.log(`[${plan.name}] Q: ${q}\n[${plan.name}] A: ${a}\n`);
        if (!expect.test(a)) problems.push(`${plan.name}: "${q}" got an unexpected answer: ${a}`);
        n++;
        if (n === 5) await page.screenshot({ path: path.join(OUT, `${plan.name}-2-asked-5.png`) });
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `${plan.name}-3-asked-all.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
    live.kill('SIGTERM');
    fixture.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(OUT, 'transcript.json'), JSON.stringify(transcript, null, 2));
  if (problems.length) {
    console.error(`PROBLEMS:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`e2e ok: ${transcript.length} questions answered; screenshots in ${OUT}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
