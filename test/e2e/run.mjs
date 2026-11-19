#!/usr/bin/env node
// Jarvis end-to-end tests (SPEC §11, §13): Playwright Chromium against the real build, served
// with the strict mock Claude API on one origin (test/server.mjs).
//
//   node test/e2e/run.mjs                    build, then run every scenario
//   node test/e2e/run.mjs --only swarm,xss   run some scenarios (comma-separated or repeated)
//   node test/e2e/run.mjs --headed           watch it in a visible browser (--slowmo 100 to slow down)
//   node test/e2e/run.mjs --list             list scenarios
//   Other flags: --no-build (reuse dist/), --mock-speed 0.5 (mock pacing; 1 = realistic)
//
// Every scenario fails on page errors, console errors, CSP violations, unexpected dialogs,
// third-party requests and mock-API violations it did not trigger on purpose. Screenshots go
// to test/artifacts/ (plus <scenario>-FAILED.png/.html/-mock.json when something fails).
// Exits 1 when any scenario fails.

import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { build, BuildError, ROOT } from '../../scripts/build.mjs';
import { startTestServer } from '../server.mjs';
import { devices, E2EError, loadPlaywright, TestContext } from './harness.mjs';
import onboarding from './scenarios/onboarding.mjs';
import firstrun from './scenarios/firstrun.mjs';
import chat from './scenarios/chat.mjs';
import swarm from './scenarios/swarm.mjs';
import pwa from './scenarios/pwa.mjs';
import layout from './scenarios/layout.mjs';
import features from './scenarios/features.mjs';
import security from './scenarios/security.mjs';
import interaction from './scenarios/interaction.mjs';
import regressions from './scenarios/regressions.mjs';
import holograms from './scenarios/holograms.mjs';
import voiceSpeech from './scenarios/voice-speech.mjs';

/** Wave B (SPEC §15): photo & PDF attachment scenarios, owned by B2 (registered when present). */
async function optionalScenarios(rel) {
  const url = new URL(rel, import.meta.url);
  return existsSync(url) ? (await import(url.href)).default : [];
}
const attachments = await optionalScenarios('./scenarios/attachments.mjs');
/** Presence UI (SPEC 2.4): the home, Needs-you, the rail, the privacy pill. */
const presence = await optionalScenarios('./scenarios/presence.mjs');

const ARTIFACTS = path.join(ROOT, 'test', 'artifacts');
export const SCENARIOS = [...onboarding, ...firstrun, ...chat, ...swarm, ...pwa, ...layout, ...features, ...holograms, ...attachments, ...presence, ...security, ...interaction, ...regressions, ...voiceSpeech];

function parseArgs(argv) {
  const opts = { only: [], headed: false, list: false, build: true, mockSpeed: undefined, slowMo: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--only' || a.startsWith('--only=')) opts.only.push(...value().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--headed') opts.headed = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--no-build') opts.build = false;
    else if (a === '--mock-speed' || a.startsWith('--mock-speed=')) opts.mockSpeed = Number(value());
    else if (a === '--slowmo' || a.startsWith('--slowmo=')) opts.slowMo = Number(value());
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node test/e2e/run.mjs [--only name[,name…]] [--headed] [--list] [--no-build] [--mock-speed 1] [--slowmo 0]');
      process.exit(0);
    } else throw new Error(`Unknown option ${a} (see --help)`);
  }
  return opts;
}

const fmtTime = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s` : `${(ms / 1000).toFixed(1)}s`);

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new E2EError(message)), ms);
    }),
  ]);
}

async function cleanArtifacts(selected, all) {
  const names = new Set(selected.map((s) => s.name));
  const files = await readdir(ARTIFACTS).catch(() => []);
  for (const f of files) {
    const owner = all.map((s) => s.name).filter((n) => f.startsWith(`${n}-`)).sort((a, b) => b.length - a.length)[0];
    if (selected.length === all.length || (owner && names.has(owner))) await rm(path.join(ARTIFACTS, f), { force: true, recursive: true });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const names = SCENARIOS.map((s) => s.name);
  if (new Set(names).size !== names.length) throw new Error('Duplicate scenario names');
  if (opts.list) {
    for (const s of SCENARIOS) console.log(`${s.name.padEnd(18)} ${s.title}`);
    return 0;
  }
  const unknown = opts.only.filter((n) => !names.includes(n));
  if (unknown.length) {
    console.error(`Unknown scenario(s): ${unknown.join(', ')}\nAvailable: ${names.join(', ')}`);
    return 2;
  }
  const selected = opts.only.length ? SCENARIOS.filter((s) => opts.only.includes(s.name)) : SCENARIOS;

  if (opts.build) {
    process.stdout.write('Building the app… ');
    try {
      const { buildId, warnings } = await build({ quiet: true });
      console.log(`build ${buildId}`);
      for (const w of warnings) console.log(`  warning: ${w}`);
    } catch (err) {
      console.log('failed');
      console.error(err instanceof BuildError ? err.message : err.stack || err);
      return 1;
    }
  }

  let playwright;
  let browser;
  try {
    playwright = await loadPlaywright();
    browser = await playwright.chromium.launch({ headless: !opts.headed, slowMo: opts.slowMo || 0 });
  } catch (err) {
    console.error(`Could not start Chromium through Playwright: ${(err.message || String(err)).split('\n')[0]}`);
    if (opts.headed) console.error('--headed needs a display (on a headless Linux box, run without --headed or use xvfb-run).');
    return 1;
  }
  const timeScale = Number.isFinite(opts.mockSpeed) ? opts.mockSpeed : undefined;
  const server = await startTestServer({ build: opts.build ? 'never' : 'if-missing', mock: { timeScale } });
  const deviceMap = devices(playwright);
  await cleanArtifacts(selected, SCENARIOS);

  console.log(`\nJarvis E2E: ${selected.length} scenario${selected.length === 1 ? '' : 's'} against ${server.url} (mock speed ${server.mock.timeScale}×)\n`);
  const results = [];
  const startedAll = Date.now();
  for (const scenario of selected) {
    server.mock.reset();
    const t = new TestContext({ scenario, browser, playwright, server, artifactsDir: ARTIFACTS, devices: deviceMap });
    const started = Date.now();
    let error = null;
    const run = Promise.resolve().then(() => scenario.run(t));
    run.catch(() => {}); // a timed-out run may reject later, after its contexts are closed
    try {
      await withTimeout(run, scenario.timeout ?? 90000, `Scenario timed out after ${fmtTime(scenario.timeout ?? 90000)}`);
    } catch (err) {
      error = err;
    }
    for (const v of server.mock.unexpectedViolations(scenario.expectViolations || [])) {
      t.issue(`Mock API violation (HTTP ${v.status} ${v.type}${v.kind ? `, ${v.kind} request` : ''}): ${v.message}`);
    }
    const failed = !!error || t.issues.length > 0;
    if (failed) await t.saveFailureArtifacts().catch(() => {});
    await t.dispose();
    const ms = Date.now() - started;
    const message = error ? `${t.currentStep ? `[${t.currentStep}] ` : ''}${(error.message || String(error)).split('\n')[0]}` : '';
    results.push({ scenario, failed, ms, message, issues: t.issues, notes: t.notes, screenshots: t.screenshots });
    console.log(`${failed ? '✖' : '✔'} ${scenario.name} (${fmtTime(ms)})`);
    if (message) console.log(`    ${message}`);
    for (const i of t.issues.slice(0, 8)) console.log(`    • ${i}`);
    if (t.issues.length > 8) console.log(`    • … and ${t.issues.length - 8} more`);
  }

  await browser.close().catch(() => {});
  await server.close();

  // Summary table.
  const rows = results.map((r) => ({
    name: r.scenario.name,
    device: deviceMap[r.scenario.device || 'iphone13']?.label || r.scenario.device,
    result: r.failed ? 'FAIL' : 'PASS',
    time: fmtTime(r.ms),
    notes: r.failed ? (r.message || r.issues[0] || '').slice(0, 90) : r.notes.join('; ').slice(0, 90),
  }));
  const w = {
    name: Math.max(8, ...rows.map((r) => r.name.length)),
    device: Math.max(6, ...rows.map((r) => r.device.length)),
  };
  console.log(`\n  ${'Scenario'.padEnd(w.name)}  ${'Device'.padEnd(w.device)}  Result  ${'Time'.padStart(7)}  Notes`);
  console.log(`  ${'-'.repeat(w.name)}  ${'-'.repeat(w.device)}  ------  ${'-'.repeat(7)}  -----`);
  for (const r of rows) console.log(`  ${r.name.padEnd(w.name)}  ${r.device.padEnd(w.device)}  ${r.result.padEnd(6)}  ${r.time.padStart(7)}  ${r.notes}`);
  const failedCount = results.filter((r) => r.failed).length;
  console.log(`\n  ${results.length - failedCount} passed, ${failedCount} failed in ${fmtTime(Date.now() - startedAll)}. Screenshots: ${path.relative(process.cwd(), ARTIFACTS) || ARTIFACTS}/\n`);
  return failedCount ? 1 : 0;
}

process.on('unhandledRejection', (err) => {
  if (process.env.E2E_DEBUG) console.error('unhandled rejection:', err);
});

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n✖ ${err?.stack || err}`);
    process.exit(1);
  });

