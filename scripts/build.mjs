#!/usr/bin/env node
// Build Jarvis into dist/ (SPEC §11).
//
//   node scripts/build.mjs [--no-minify] [--quiet]
//
// 1. clean dist/
// 2. bundle src/main.js -> dist/assets/app.js (+ app.css from the CSS it imports, or from
//    src/styles/app.css), ESM, minified, with source maps, target es2020 + safari15; code
//    splitting puts dynamically imported modules (the 3D viewer) in dist/assets/chunks/
// 3. copy public/ -> dist/
// 4. BUILD_ID = first 8 hex chars of sha256 over every output file (path + content)
// 5. fill placeholders: __BUILD_ID__ (index.html, sw.js), __APP_VERSION__ (index.html) and
//    /*__PRECACHE__*/[] (sw.js: relative URLs of all dist files except source maps, sw.js and
//    dotfiles)
// 6. print a size summary
//
// Also importable: `import { build } from './build.mjs'` (used by serve.mjs, deploy-pages.mjs and
// test/server.mjs).

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TARGET = ['es2020', 'safari15'];

export class BuildError extends Error {}

/**
 * Build the app. Resolves to { buildId, version, outDir, files: [{ path, bytes, gzipBytes }] }.
 * Throws BuildError with a readable message when something required is missing or esbuild fails.
 */
export async function build({ root = ROOT, minify = true, quiet = false, outDir: outOverride = null } = {}) {
  const log = quiet ? () => {} : (...args) => console.log(...args);
  const srcEntry = path.join(root, 'src', 'main.js');
  const cssEntry = path.join(root, 'src', 'styles', 'app.css');
  const publicDir = path.join(root, 'public');
  const outDir = outOverride ? path.resolve(outOverride) : path.join(root, 'dist'); // outDir: a scratch build elsewhere
  const assetsDir = path.join(outDir, 'assets');

  if (!existsSync(srcEntry)) {
    throw new BuildError(
      'Cannot build: src/main.js is missing.\n' +
        'It is the app entry point (owned by the ui-shell engineer, SPEC §3/§10.4). Create it, then run the build again.',
    );
  }
  if (!existsSync(path.join(publicDir, 'index.html'))) {
    throw new BuildError('Cannot build: public/index.html is missing (the app shell page, SPEC §11).');
  }

  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    throw new BuildError('Cannot build: esbuild is not installed. Run "npm install" first.');
  }

  const started = Date.now();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  const common = {
    bundle: true,
    minify,
    sourcemap: true,
    target: TARGET,
    platform: 'browser',
    outdir: assetsDir,
    entryNames: '[name]',
    assetNames: '[name]-[hash]',
    loader: { '.png': 'file', '.jpg': 'file', '.webp': 'file', '.svg': 'file', '.woff': 'file', '.woff2': 'file' },
    // Self-hosted fonts live in public/fonts (with their license) and are copied as they are:
    // the stylesheet's url(../fonts/…) then resolves from assets/app.css to fonts/ (SPEC 2.4.15).
    external: ['../fonts/*'],
    logLevel: quiet ? 'error' : 'warning',
    absWorkingDir: root,
  };
  try {
    // Code splitting: modules loaded with import() (the 3D hologram viewer and three.js) become
    // their own chunks under assets/chunks/, fetched only when first used; code they share with
    // the main bundle goes to a shared chunk. Chunk names carry a content hash, and every chunk is
    // in the service worker's precache list (below), so they work offline like app.js.
    await esbuild.build({ ...common, entryPoints: { app: srcEntry }, format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"' } });
    if (!existsSync(path.join(assetsDir, 'app.css'))) {
      // main.js did not import the styles: bundle the stylesheet entry on its own.
      if (existsSync(cssEntry)) {
        await esbuild.build({ ...common, entryPoints: { app: cssEntry } });
      } else {
        if (!quiet) console.warn('warning: no CSS found (src/main.js imports none and src/styles/app.css is missing); writing an empty app.css');
        await writeFile(path.join(assetsDir, 'app.css'), '');
      }
    }
  } catch (err) {
    if (!quiet && err.errors?.length) throw new BuildError('esbuild failed (see the errors above).');
    const details = (err.errors || []).map((e) => `  ${e.location ? `${e.location.file}:${e.location.line}:${e.location.column}: ` : ''}${e.text}`).join('\n');
    throw new BuildError(`esbuild failed${details ? `:\n${details}` : `: ${err.message}`}`);
  }

  await cp(publicDir, outDir, { recursive: true, filter: (src) => !/(^|[/\\])\.DS_Store$/.test(src) });

  const files = await listFiles(outDir);
  const hash = createHash('sha256');
  for (const rel of files) {
    hash.update(rel).update('\0').update(await readFile(path.join(outDir, rel))).update('\0');
  }
  const buildId = hash.digest('hex').slice(0, 8);
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const version = String(pkg.version || '0.0.0');

  const precache = files
    .filter((rel) => !rel.endsWith('.map') && rel !== 'sw.js' && !rel.split('/').some((seg) => seg.startsWith('.')))
    .map((rel) => `./${rel}`);

  const warnings = [];
  const indexPath = path.join(outDir, 'index.html');
  let html = await readFile(indexPath, 'utf8');
  if (!html.includes('__BUILD_ID__')) warnings.push('public/index.html has no __BUILD_ID__ placeholder (assets will not be cache-busted)');
  html = html.replaceAll('__BUILD_ID__', buildId).replaceAll('__APP_VERSION__', version);
  await writeFile(indexPath, html);

  const swPath = path.join(outDir, 'sw.js');
  if (existsSync(swPath)) {
    let sw = await readFile(swPath, 'utf8');
    if (!sw.includes('/*__PRECACHE__*/[]')) warnings.push('public/sw.js has no /*__PRECACHE__*/[] placeholder (nothing will be precached)');
    if (!sw.includes('__BUILD_ID__')) warnings.push('public/sw.js has no __BUILD_ID__ placeholder (old caches will never be replaced)');
    sw = sw.replaceAll('/*__PRECACHE__*/[]', JSON.stringify(precache)).replaceAll('__BUILD_ID__', buildId);
    await writeFile(swPath, sw);
  } else {
    warnings.push('public/sw.js is missing: the app will not work offline (owned by platform, SPEC §9.4)');
  }

  const summary = [];
  for (const rel of files) {
    const buf = await readFile(path.join(outDir, rel));
    summary.push({ path: rel, bytes: buf.length, gzipBytes: /\.(js|css|html|json|webmanifest|svg|map|txt)$/.test(rel) ? gzipSync(buf).length : null });
  }

  if (!quiet) {
    printSummary(summary, { buildId, version, ms: Date.now() - started });
    for (const w of warnings) console.warn(`warning: ${w}`);
  }
  return { buildId, version, outDir, files: summary, warnings, precache };
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function formatBytes(n) {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function printSummary(files, { buildId, version, ms }) {
  const width = Math.max(4, ...files.map((f) => f.path.length));
  console.log(`\nJarvis ${version} — build ${buildId} (${ms} ms)\n`);
  console.log(`  ${'file'.padEnd(width)}  ${'size'.padStart(10)}  ${'gzip'.padStart(10)}`);
  for (const f of files) console.log(`  ${f.path.padEnd(width)}  ${formatBytes(f.bytes).padStart(10)}  ${formatBytes(f.gzipBytes).padStart(10)}`);
  const total = files.filter((f) => !f.path.endsWith('.map')).reduce((a, f) => a + f.bytes, 0);
  console.log(`\n  ${files.length} files, ${formatBytes(total)} without source maps\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  build({ minify: !args.has('--no-minify'), quiet: args.has('--quiet') }).catch((err) => {
    console.error(`\n✖ ${err instanceof BuildError ? err.message : err.stack || err}`);
    process.exit(1);
  });
}
