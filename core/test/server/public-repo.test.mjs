// node --test: core/ is published in a public repository, so it never names the owner's place. The brief's
// sample location (its city and coordinates) must not appear in any file; examples use Wellington.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = new Set(['node_modules', 'artifacts', '.git']);
const TEXT = /\.(mjs|js|json|md|html|css|sh|txt|svg|service|timer|desktop)$/;
// Spelled in pieces so this file does not match itself.
const PATTERNS = [new RegExp(['at', 'lanta'].join(''), 'i'), new RegExp(['33', '75'].join('\\.')), new RegExp(['-84', '39'].join('\\.'))];

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (TEXT.test(e.name) || !e.name.includes('.')) yield p;
  }
}

test('no personal details: the brief\'s sample place and coordinates appear nowhere in core/', () => {
  const hits = [];
  for (const f of files(CORE)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const re of PATTERNS) if (re.test(text)) hits.push(`${path.relative(CORE, f)}: ${re}`);
  }
  assert.deepEqual(hits, []);
});
