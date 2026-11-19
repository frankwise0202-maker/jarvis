#!/usr/bin/env node
// Put the natural voice's model files in vendor/kokoro/ so the build self-hosts them under
// dist/models/ (the recommended setup: same origin, no CSP change, no third-party request at
// run time). Run before `npm run deploy`; vendor/ is not committed.
//
//   node scripts/fetch-voice-model.mjs [--dtype q8] [--from <base URL>] [--voices bm_george,…]
//
// - Model files come from Hugging Face at the pinned revision (catalog.js MODEL.revision), or
//   from --from <base> (a mirror laid out as <base>/<file>). Every file is checked against the
//   size and SHA-256 in catalog.js before it is moved into place; a mismatch aborts.
// - Voice files are copied from the kokoro-js npm package (identical to HF's, hashes checked).
// - Files already in place with the right hash are kept (no download).

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { MODEL, VOICES, isVoiceId } from '../src/platform/voice/natural/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dtype = opt('dtype', 'q8');
const from = opt('from', `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/`);
const voices = opt('voices', VOICES.map((v) => v.id).join(',')).split(',').filter(isVoiceId);
const dest = path.join(ROOT, 'vendor', 'kokoro', MODEL.id);

/** Git's blob id: sha1("blob <size>\0" + content) (what the HF API lists for small files). */
function gitSha1(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

async function matches(file, { bytes, sha256, gitSha1: blob }) {
  if (!existsSync(file)) return false;
  const buf = await readFile(file);
  if (bytes && buf.length !== bytes) return false;
  if (sha256 && createHash('sha256').update(buf).digest('hex') !== sha256) return false;
  if (blob && gitSha1(buf) !== blob) return false;
  return true;
}

async function fetchChecked(rel, spec) {
  const { bytes, sha256 } = spec;
  const out = path.join(dest, rel);
  if (await matches(out, spec)) {
    console.log(`  ok    ${rel} (already there)`);
    return;
  }
  await mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.part`;
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
  if ((bytes && n !== bytes) || (sha256 && hex !== sha256) || (spec.gitSha1 && !(await matches(tmp, spec)))) {
    await rm(tmp, { force: true });
    throw new Error(`${rel}: got ${n} bytes, sha256 ${hex}, which is not the pinned file (${bytes} bytes${sha256 ? `, sha256 ${sha256}` : ''}${spec.gitSha1 ? `, git blob ${spec.gitSha1}` : ''}). Nothing was changed.`);
  }
  await rename(tmp, out);
  console.log(`  fetched ${rel} (${(n / 1e6).toFixed(1)} MB, matches the pinned file)`);
}

process.on('uncaughtException', (err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
const weights = MODEL.weights[dtype];
if (!weights) throw new Error(`Unknown dtype ${dtype}; one of ${Object.keys(MODEL.weights).join(', ')}`);
console.log(`Natural voice model ${MODEL.id}@${MODEL.revision.slice(0, 8)} (${dtype}) -> ${path.relative(ROOT, dest)}`);
for (const f of MODEL.common) await fetchChecked(f.path, f);
await fetchChecked(weights.path, weights);
// Voices: from the npm package, hash-checked.
const kokoroDir = path.dirname(createRequire(path.join(ROOT, 'package.json')).resolve('kokoro-js/package.json').replace(/package\.json$/, 'x'));
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
console.log('Done. The next build copies vendor/kokoro/ to dist/models/.');
