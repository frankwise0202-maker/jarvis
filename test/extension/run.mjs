#!/usr/bin/env node
// Jarvis for Chrome: every test (npm run test:extension).
//   1. unit tests (node --test test/extension/unit/*.test.mjs)
//   2. end-to-end tests with Playwright and the real unpacked extension (e2e/run.mjs)
// Prints one summary line per suite and exits 1 if anything failed.
//
//   node test/extension/run.mjs [--unit-only | --e2e-only] [e2e flags such as --only basic]

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { runE2E } from './e2e/run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const unitOnly = argv.includes('--unit-only');
const e2eOnly = argv.includes('--e2e-only');
const e2eArgs = argv.filter((a) => a !== '--unit-only' && a !== '--e2e-only');

function runUnit() {
  const files = readdirSync(path.join(HERE, 'unit'))
    .filter((f) => f.endsWith('.test.mjs'))
    .map((f) => path.join(HERE, 'unit', f));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=spec', '--test-timeout=120000', ...files], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('close', (code) => {
      const num = (label) => Number((new RegExp(`ℹ ${label} (\\d+)`).exec(out) || [])[1] || 0);
      resolve({ code, tests: num('tests'), passed: num('pass'), failed: num('fail'), files: files.length });
    });
  });
}

const lines = [];
let failed = false;
if (!e2eOnly) {
  console.log('\n— Unit tests —\n');
  const u = await runUnit();
  lines.push(`Unit: ${u.passed} passed, ${u.failed} failed (${u.tests} tests in ${u.files} files)`);
  if (u.code !== 0 || u.failed) failed = true;
}
if (!unitOnly) {
  console.log('\n— End-to-end tests (Playwright, real extension) —\n');
  const e = await runE2E(e2eArgs);
  lines.push(`E2E: ${e.passed} passed, ${e.failed} failed (${e.passed + e.failed} scenarios)`);
  if (e.failed) failed = true;
}
console.log(`\n${lines.join('\n')}`);
process.exit(failed ? 1 : 0);
