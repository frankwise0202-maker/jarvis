// v8.1 (lead decision D3): wake.pending(), the lines said before the wake greeting (src/lib/wake/pending.js).
// Several builders register; a line that waits for an answer (Chrome's) comes first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWakePending } from '../../src/lib/wake/pending.js';

test('nothing registered: no lines', () => {
  assert.deepEqual(createWakePending().lines(), []);
});

test('several functions: each asked at each wake; a line that waits (Chrome’s) first, then the others in the order added', () => {
  const p = createWakePending();
  let speaker = 'I’m on the Mac’s speakers; the speakerphone isn’t connected.';
  let chrome = null;
  p.add(() => speaker);
  p.add(() => chrome, { waits: true });
  assert.deepEqual(p.lines(), [speaker], 'Chrome has nothing now');
  chrome = 'Chrome is waiting for you: add the monitor to the cart? Say approve, or cancel.';
  assert.deepEqual(p.lines(), [chrome, speaker], 'Chrome’s question first, though added second');
  speaker = null;
  assert.deepEqual(p.lines(), [chrome], 'asked again at each wake');
});

test('lines are tidied (spaces, length); empty, null, non-strings and a function that throws count as nothing', () => {
  const p = createWakePending();
  p.add(() => '  Two   spaces\nand a line.  ');
  p.add(() => '');
  p.add(() => 42);
  p.add(() => {
    throw new Error('broken');
  });
  p.add(() => 'x'.repeat(500));
  const lines = p.lines();
  assert.equal(lines[0], 'Two spaces and a line.');
  assert.equal(lines.length, 2);
  assert.equal(lines[1].length, 240);
});

test('add() returns remove(); a non-function is ignored', () => {
  const p = createWakePending();
  const remove = p.add(() => 'A line.');
  assert.equal(typeof p.add(null), 'function');
  assert.deepEqual(p.lines(), ['A line.']);
  remove();
  remove();
  assert.deepEqual(p.lines(), []);
});
