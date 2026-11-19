// node --test: geometry and text-metric helpers (ported from the phase A blueprint prototype).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePathData, pathBounds, arcPoints, textWidth, wrapText, ellipsize, fitText, shapeBoundsWithRepeats, fmt, hash32 } from '../../src/lib/blueprint-geom.js';

test('path parser: implicit linetos, relative commands, arc flags without separators', () => {
  const p = parsePathData('m10 10 20 0 0 20z');
  assert.deepEqual(p.segments, [['m', 10, 10], ['l', 20, 0], ['l', 0, 20], ['z']]);
  const a = parsePathData('M0 0a5 5 0 1110 0');
  assert.deepEqual(a.segments[1], ['a', 5, 5, 0, 1, 1, 10, 0]);
  assert.equal(parsePathData('M0 0 L-5-5').d, 'M 0 0 L -5 -5');
  assert.deepEqual(parsePathData('M.5.5').segments, [['M', 0.5, 0.5]]);
});

test('path bounds include curves and true arc extents', () => {
  const b = pathBounds(parsePathData('M 0 0 A 50 50 0 0 1 100 0').segments);
  assert.ok(Math.abs(b[1] - -50) < 1, `arc top ${b[1]}`);
  assert.equal(b[0], 0);
  assert.equal(b[2], 100);
  const rel = pathBounds(parsePathData('M 10 10 h 30 v 40 H 0 Z').segments);
  assert.deepEqual(rel, [0, 10, 40, 50]);
  const pts = arcPoints(0, 0, 10, 10, 0, 0, 1, 0, 0);
  assert.equal(pts.length, 2);
});

test('text width uses Helvetica/Arial metrics', () => {
  assert.equal(textWidth('', 12), 0);
  assert.ok(Math.abs(textWidth('Hello', 10) - 22.78) < 0.01);
  assert.ok(textWidth('WWW', 10, { bold: true }) > textWidth('iii', 10, { bold: true }) * 3);
  assert.ok(textWidth('AB', 10, { spacing: 2 }) - textWidth('AB', 10) === 2);
});

test('wrap, ellipsize and fit', () => {
  const lines = wrapText('The quick brown fox jumps over the lazy dog', 60, 10);
  for (const l of lines) assert.ok(textWidth(l, 10) <= 60, l);
  assert.equal(lines.join(' '), 'The quick brown fox jumps over the lazy dog');
  const capped = wrapText('one two three four five six seven eight nine ten', 40, 10, { maxLines: 2 });
  assert.equal(capped.length, 2);
  assert.ok(capped[1].endsWith('…'));
  const longWord = wrapText('Supercalifragilisticexpialidocious', 50, 10);
  assert.ok(longWord.length > 1 && longWord.every((l) => textWidth(l, 10) <= 50));
  assert.ok(textWidth(ellipsize('A very long label indeed', 50, 10), 10) <= 50);
  const fit = fitText('HOW A 2024 TOYOTA CAMRY HYBRID IS BUILT', 380, 21, 13, { bold: true, maxLines: 2 });
  assert.ok(fit.lines.length <= 2 && fit.size <= 21 && fit.size >= 13);
});

test('repeat bounds cover every copy', () => {
  const b = shapeBoundsWithRepeats({ type: 'circle', at: [50, 0], r: 5, repeat: { count: 4, around: [0, 0], step: 90 } });
  assert.ok(b[0] <= -55 && b[2] >= 55 && b[1] <= -55 && b[3] >= 55);
  const t = shapeBoundsWithRepeats({ type: 'rect', at: [0, 0], size: [10, 10], repeat: { count: 3, along: [20, 0] } });
  assert.deepEqual(t, [0, 0, 50, 10]);
});

test('fmt and hash32', () => {
  assert.equal(fmt(-0.001), '0');
  assert.equal(fmt(1.23456), '1.23');
  assert.equal(fmt(NaN), '0');
  assert.equal(hash32('abc'), hash32('abc'));
  assert.match(hash32('abc'), /^[0-9A-F]{8}$/);
});
