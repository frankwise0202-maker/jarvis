#!/usr/bin/env node
// Build Jarvis for Chrome (extension/) into dist-extension/ and package dist-extension.zip.
//
//   node scripts/build-extension.mjs              release build + zip (what the owner installs)
//   node scripts/build-extension.mjs --dev --out <dir>
//                                                 development build for the tests: the API base is
//                                                 configurable (local mock) and localhost is allowed
//   Other flags: --no-zip, --no-minify, --quiet
//
// Steps: bundle the page agent (an IIFE string), the service worker (ESM, with the agent inlined
// via a virtual module), the side panel and the microphone helper page (ESM + CSS) with the repo's
// esbuild; copy the HTML; write manifest.json; render the PNG icons; zip the folder under a single
// top-level "jarvis-for-chrome/" folder (so unzipping on a Mac gives one folder to Load unpacked).
//
// Also importable: `import { buildExtension } from './build-extension.mjs'` (used by the tests).

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VERSION, createManifest } from '../extension/build/manifest.mjs';
import { makeIcons } from '../extension/build/icons.mjs';
import { zipFiles } from '../extension/build/zip.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXT = path.join(ROOT, 'extension');
export const DEFAULT_OUT = path.join(ROOT, 'dist-extension');
export const DEFAULT_ZIP = path.join(ROOT, 'dist-extension.zip');
export const ZIP_FOLDER = 'jarvis-for-chrome';
const TARGET = ['chrome120'];

export class ExtensionBuildError extends Error {}

function virtualPageAgent(source) {
  return {
    name: 'virtual-page-agent',
    setup(build) {
      build.onResolve({ filter: /^virtual:page-agent$/ }, () => ({ path: 'page-agent', namespace: 'virtual' }));
      build.onLoad({ filter: /^page-agent$/, namespace: 'virtual' }, () => ({ contents: `export default ${JSON.stringify(source)};`, loader: 'js' }));
    },
  };
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

/**
 * Builds the extension. Resolves to { outDir, zipPath, version, files: [{ path, bytes }] }.
 */
export async function buildExtension({ dev = false, outDir = DEFAULT_OUT, zip = !dev, zipPath = DEFAULT_ZIP, minify = true, quiet = false } = {}) {
  const log = quiet ? () => {} : (...a) => console.log(...a);
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    throw new ExtensionBuildError('esbuild is not installed. Run "npm ci" first.');
  }
  const started = Date.now();
  // Jarvis for Chrome has its own version (extension/build/manifest.mjs), not the web app's.
  const version = VERSION;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, 'icons'), { recursive: true });

  const define = { __DEV__: dev ? 'true' : 'false', 'process.env.NODE_ENV': '"production"' };
  const common = { bundle: true, minify, target: TARGET, platform: 'browser', legalComments: 'none', logLevel: quiet ? 'error' : 'warning', absWorkingDir: ROOT, define };
  try {
    const page = await esbuild.build({ ...common, entryPoints: [path.join(EXT, 'src/page/agent.js')], format: 'iife', write: false });
    const pageSource = page.outputFiles[0].text;
    await esbuild.build({
      ...common,
      entryPoints: { background: path.join(EXT, 'src/background/index.js') },
      format: 'esm',
      outdir: outDir,
      sourcemap: dev ? 'linked' : false,
      plugins: [virtualPageAgent(pageSource)],
    });
    await esbuild.build({
      ...common,
      entryPoints: { sidepanel: path.join(EXT, 'src/sidepanel/main.js'), mic: path.join(EXT, 'src/sidepanel/mic.js') },
      format: 'esm',
      outdir: outDir,
      sourcemap: dev ? 'linked' : false,
    });
    await esbuild.build({ ...common, entryPoints: { sidepanel: path.join(EXT, 'src/sidepanel/styles.css') }, outdir: outDir });
  } catch (err) {
    const details = (err.errors || []).map((e) => `  ${e.location ? `${e.location.file}:${e.location.line}:${e.location.column}: ` : ''}${e.text}`).join('\n');
    throw new ExtensionBuildError(`esbuild failed${details ? `:\n${details}` : `: ${err.message}`}`);
  }

  for (const html of ['sidepanel.html', 'mic.html']) await cp(path.join(EXT, 'src/sidepanel', html), path.join(outDir, html));
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(createManifest({ dev, version }), null, 2)}\n`);
  for (const [size, png] of Object.entries(makeIcons())) await writeFile(path.join(outDir, 'icons', `icon-${size}.png`), png);

  // A release build must not contain the development hooks (mock API base, test handles) nor
  // grant itself localhost access.
  if (!dev) {
    const bg = await readFile(path.join(outDir, 'background.js'), 'utf8');
    const panel = await readFile(path.join(outDir, 'sidepanel.js'), 'utf8');
    for (const marker of ['jarvis.dev.apiBase', 'jarvis.dev.voiceApprovals', '__jarvisController', '__jarvisCommand', '__jarvisLink', 'testStop']) {
      if (bg.includes(marker) || panel.includes(marker)) throw new ExtensionBuildError(`Release build contains the development marker "${marker}".`);
    }
    const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8'));
    if (JSON.stringify(manifest).match(/127\.0\.0\.1|localhost/)) throw new ExtensionBuildError('Release manifest grants localhost access.');
  }

  const files = [];
  for (const rel of await listFiles(outDir)) files.push({ path: rel, bytes: (await readFile(path.join(outDir, rel))).length });

  let writtenZip = null;
  if (zip) {
    const entries = [];
    for (const f of files) {
      if (f.path.endsWith('.map')) continue;
      entries.push({ name: `${ZIP_FOLDER}/${f.path}`, data: await readFile(path.join(outDir, f.path)) });
    }
    await writeFile(zipPath, zipFiles(entries));
    writtenZip = zipPath;
  }

  if (!quiet) {
    const width = Math.max(...files.map((f) => f.path.length));
    log(`\nJarvis for Chrome ${version}${dev ? ' (dev)' : ''} — ${Date.now() - started} ms\n`);
    for (const f of files) log(`  ${f.path.padEnd(width)}  ${(f.bytes / 1024).toFixed(1).padStart(8)} kB`);
    if (writtenZip) log(`\n  ${path.relative(ROOT, writtenZip)}  ${((await readFile(writtenZip)).length / 1024).toFixed(1)} kB`);
    log('');
  }
  return { outDir, zipPath: writtenZip, version, files };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const outArg = argv.indexOf('--out');
  const dev = argv.includes('--dev');
  const outDir = outArg >= 0 ? path.resolve(argv[outArg + 1]) : dev ? path.join(ROOT, 'dist-extension-dev') : DEFAULT_OUT;
  if (!existsSync(EXT)) {
    console.error('✖ extension/ is missing');
    process.exit(1);
  }
  buildExtension({ dev, outDir, zip: !argv.includes('--no-zip') && !dev, minify: !argv.includes('--no-minify'), quiet: argv.includes('--quiet') }).catch((err) => {
    console.error(`\n✖ ${err instanceof ExtensionBuildError ? err.message : err.stack || err}`);
    process.exit(1);
  });
}
