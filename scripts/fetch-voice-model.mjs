#!/usr/bin/env node
// Put the natural voice's model files in vendor/kokoro/ so the build self-hosts them under
// dist/models/ (same origin, no CSP change, no third-party request at run time, works offline).
// Run before `npm run deploy`; vendor/ is not committed.
//
//   node scripts/fetch-voice-model.mjs [--dtype q8,fp32] [--from <base URL>] [--voices bm_george,…]
//
// - Both engines by default: q8 (92.4 MB, the processor/WASM engine) and fp32 (325.5 MB, the
//   graphics-chip/WebGPU engine). `--dtype q8` fetches only the first (devices then never get the
//   WebGPU engine's file: the worker falls back to WASM when it is missing).
// - Model files come from Hugging Face at the pinned revision (catalog.js MODEL.revision), or from
//   --from <base> (a mirror laid out as <base>/<file>). Every file is checked against the size and
//   SHA-256 in catalog.js before it is used; a mismatch aborts and changes nothing.
// - Files bigger than PART_BYTES (48 MiB) are split into <file>.part0, .part1, … so every file on
//   GitHub Pages stays under GitHub's 100 MB limit (and its 50 MB warning). The worker joins them
//   and checks the whole file's SHA-256 again (kokoro-engine.js). The whole files are kept in
//   vendor/kokoro-cache/ (not deployed) so a second run downloads nothing.
// - Voice files are copied from the kokoro-js npm package (identical to HF's, hashes checked).

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { MODEL, PART_BYTES, VOICES, isVoiceId, partsOf } from '../src/platform/voice/natural/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dtypes = opt('dtype', 'q8,fp32').split(',').map((d) => d.trim()).filter(Boolean);
const from = opt('from', `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/`);
const voices = opt('voices', VOICES.map((v) => v.id).join(',')).split(',').filter(isVoiceId);
const dest = path.join(ROOT, 'vendor', 'kokoro', MODEL.id); // copied to dist/models/ by the build
const cacheDir = path.join(ROOT, 'vendor', 'kokoro-cache', MODEL.id); // whole files, never deployed
const LIMIT = 100 * 1000 * 1000; // GitHub's hard limit per file

/** Git's blob id: sha1("blob <size>\0" + content) (what the HF API lists for small files). */
function gitSha1(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

async function fileSha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function matches(file, { bytes, sha256, gitSha1: blob }) {
  if (!existsSync(file)) return false;
  if (bytes && (await stat(file)).size !== bytes) return false;
  if (sha256 && (await fileSha256(file)) !== sha256) return false;
  if (blob && gitSha1(await readFile(file)) !== blob) return false;
  return true;
}

/** Downloads `rel` into `dir` unless a file with the pinned size and hash is already there. */
async function fetchChecked(rel, spec, dir) {
  const out = path.join(dir, rel);
  if (await matches(out, spec)) {
    console.log(`  ok    ${rel} (already there)`);
    return out;
  }
  await mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.download`;
  const url = new URL(rel, from).href;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status} from ${url}`);
  const hash = createHash('sha256');
  let n = 0;
  const counted = Readable.fromWeb(res.body).on('data', (c) => {
    hash.update(c);
    n += c.length;
  });
  await pipeline(counted, createWriteStream(tmp));
  const hex = hash.digest('hex');
  if ((spec.bytes && n !== spec.bytes) || (spec.sha256 && hex !== spec.sha256) || (spec.gitSha1 && !(await matches(tmp, spec)))) {
    await rm(tmp, { force: true });
    throw new Error(`${rel}: got ${n} bytes, sha256 ${hex}, which is not the pinned file (${spec.bytes} bytes${spec.sha256 ? `, sha256 ${spec.sha256}` : ''}${spec.gitSha1 ? `, git blob ${spec.gitSha1}` : ''}). Nothing was changed.`);
  }
  await rename(tmp, out);
  console.log(`  fetched ${rel} (${(n / 1e6).toFixed(1)} MB, matches the pinned file)`);
  return out;
}

/** Writes `whole` as <rel>.part0 … in dest (each ≤ PART_BYTES); removes an unsplit copy there. */
async function writeParts(whole, rel, spec) {
  const n = partsOf(spec.bytes);
  const buf = await readFile(whole);
  for (let i = 0; i < n; i++) {
    const part = buf.subarray(i * PART_BYTES, Math.min(buf.length, (i + 1) * PART_BYTES));
    if (part.length >= LIMIT) throw new Error(`${rel}.part${i} would be ${part.length} bytes, over GitHub's 100 MB limit`);
    const file = path.join(dest, `${rel}.part${i}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, part);
  }
  await rm(path.join(dest, rel), { force: true });
  console.log(`  split   ${rel} into ${n} parts of at most ${(PART_BYTES / 1048576).toFixed(0)} MiB`);
}

process.on('uncaughtException', (err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
for (const d of dtypes) if (!MODEL.weights[d]) throw new Error(`Unknown dtype ${d}; one of ${Object.keys(MODEL.weights).join(', ')}`);
console.log(`Natural voice model ${MODEL.id}@${MODEL.revision.slice(0, 8)} (${dtypes.join(' + ')}) -> ${path.relative(ROOT, dest)}`);
for (const f of MODEL.common) await fetchChecked(f.path, f, dest);
for (const d of dtypes) {
  const w = MODEL.weights[d];
  if (partsOf(w.bytes) > 1) await writeParts(await fetchChecked(w.path, w, cacheDir), w.path, w);
  else await fetchChecked(w.path, w, dest);
}
// Voices: from the npm package, hash-checked.
// kokoro-js does not export its package.json, so its folder is found directly.
const kokoroDir = path.join(ROOT, 'node_modules', 'kokoro-js');
if (!existsSync(path.join(kokoroDir, 'voices'))) throw new Error('node_modules/kokoro-js/voices is missing: run "npm ci" first.');
await mkdir(path.join(dest, 'voices'), { recursive: true });
for (const id of voices) {
  const src = path.join(kokoroDir, 'voices', `${id}.bin`);
  const data = await readFile(src);
  const want = VOICES.find((v) => v.id === id).sha256;
  const got = createHash('sha256').update(data).digest('hex');
  if (got !== want) throw new Error(`voices/${id}.bin from npm has sha256 ${got}, expected ${want}`);
  await writeFile(path.join(dest, 'voices', `${id}.bin`), data);
}
console.log(`  copied ${voices.length} voices from kokoro-js (sha256 ok)`);
await writeFile(path.join(dest, 'LICENSE.txt'), `Kokoro-82M (${MODEL.id}, revision ${MODEL.revision}) is licensed under the Apache License 2.0.\nhttps://huggingface.co/hexgrad/Kokoro-82M · https://www.apache.org/licenses/LICENSE-2.0\n`);
console.log('Done. The next build copies vendor/kokoro/ to dist/models/ (every file under 50 MB).');
