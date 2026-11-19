#!/usr/bin/env node
// Jarvis for Chrome end-to-end tests: Playwright Chromium with the real unpacked extension
// (development build), the scripted mock Claude API and local test sites.
//
//   node test/extension/e2e/run.mjs                   build (dev), then run every scenario
//   node test/extension/e2e/run.mjs --only basic,stop  run some scenarios
//   node test/extension/e2e/run.mjs --list | --headed | --no-build
//
// A scenario fails on its own assertions, on page or panel errors, and on any mock API
// violation (the mock validates every request like the real API). Screenshots go to
// test/extension/artifacts/. Exits 1 when any scenario fails.

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtension } from '../../../scripts/build-extension.mjs';
import { startExtensionTestServer } from '../server.mjs';
import { Run, loadPlaywright } from './harness.mjs';
import { SCENARIOS } from './scenarios.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.resolve(HERE, '..', 'artifacts');

function parseArgs(argv) {
  const opts = { only: [], list: false, build: true, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') opts.only.push(...argv[++i].split(','));
    else if (a.startsWith('--only=')) opts.only.push(...a.slice(7).split(','));
    else if (a === '--list') opts.list = true;
    else if (a === '--no-build') opts.build = false;
    else if (a === '--headed') opts.headed = true;
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

export async function runE2E(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.list) {
    for (const s of SCENARIOS) console.log(`${s.name.padEnd(16)} ${s.title}`);
    return { passed: 0, failed: 0 };
  }
  const selected = opts.only.length ? SCENARIOS.filter((s) => opts.only.includes(s.name)) : SCENARIOS;
  if (!selected.length) throw new Error(`no scenarios match ${opts.only.join(',')}`);

  const extDir = opts.build ? await mkdtemp(path.join(os.tmpdir(), 'jarvis-ext-dev-')) : path.resolve(HERE, '..', '..', '..', 'dist-extension-dev');
  if (opts.build) await buildExtension({ dev: true, outDir: extDir, zip: false, quiet: true });
  const server = await startExtensionTestServer();
  const pw = loadPlaywright();
  const results = [];
  const started = Date.now();
  for (const scenario of selected) {
    // A scenario's screenshots and failure reports from earlier runs go first.
    for (const f of await readdir(ARTIFACTS).catch(() => [])) if (f.startsWith(`${scenario.name}-`)) await rm(path.join(ARTIFACTS, f), { force: true });
    server.mock.reset();
    server.resetSites();
    const run = new Run({ pw, extDir, server, artifacts: ARTIFACTS, name: scenario.name, headed: opts.headed });
    const t0 = Date.now();
    let error = null;
    try {
      await run.start(scenario.start || {});
      await scenario.run(run);
      const violations = server.mock.violations.filter((v) => v.status !== 0 && !(scenario.allowViolations || []).some((re) => re.test(v.message)));
      if (violations.length) throw new Error(`mock API violations: ${violations.map((v) => v.message).join('; ')}`);
      if (run.issues.length) throw new Error(`errors during the run: ${run.issues.join('; ')}`);
    } catch (err) {
      error = err;
    }
    await run.close({ failed: !!error });
    const ms = Date.now() - t0;
    results.push({ name: scenario.name, ok: !error, ms, error });
    console.log(`${error ? '✖' : '✔'} ${scenario.name.padEnd(16)} ${scenario.title} (${(ms / 1000).toFixed(1)} s)`);
    if (error) console.log(`    ${String(error.stack || error).split('\n').slice(0, 6).join('\n    ')}`);
  }
  await server.close();
  if (opts.build) await rm(extDir, { recursive: true, force: true });
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nE2E: ${passed} passed, ${failed} failed (${results.length} scenarios, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  return { passed, failed, results };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runE2E()
    .then(({ failed }) => process.exit(failed ? 1 : 0))
    .catch((err) => {
      console.error(err.stack || err);
      process.exit(1);
    });
}
