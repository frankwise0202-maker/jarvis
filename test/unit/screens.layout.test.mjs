// Windows (v8.1): where several windows go (src/lib/screen-placement.js layoutRects / layoutArea).
// Pure: stubbed screens and Jarvis's own window. The rules: the other monitor first; on Jarvis's
// screen alone, never cover all of his window (a strip of at least KEEP_STRIP_PX stays in view, or all
// of him when there is room beside him: macOS counts a covered window as hidden); two halves, a grid
// for three and four; rects in screen coordinates, left to right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEEP_STRIP_PX, MAX_WINDOWS, layoutArea, layoutRects, windowRect } from '../../src/lib/screen-placement.js';

const LAPTOP = { left: 0, top: 0, width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875, isPrimary: true, isInternal: true, label: 'Built-in Retina Display' };
const DELL = { left: 1440, top: 0, width: 2560, height: 1440, availLeft: 1440, availTop: 0, availWidth: 2560, availHeight: 1415, isPrimary: false, isInternal: false, label: 'DELL U2720Q' };
// window.screen in Chrome (no left/top of its own; the usable area in desktop coordinates).
const SCREEN = { width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875 };
const FULL = { left: 0, top: 25, width: 1440, height: 875 }; // Jarvis maximized on the laptop

const right = (r) => r.left + r.width;
const overlap = (a, b) => Math.max(0, Math.min(right(a), right(b)) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
const inside = (r, area) => r.left >= area.left && r.top >= area.top && right(r) <= area.left + area.width && r.top + r.height <= area.top + area.height;
const whole = (r) => [r.left, r.top, r.width, r.height].every(Number.isInteger);

test('one screen, Jarvis maximized: two halves of what is left, his strip in view', () => {
  const rects = layoutRects({ screens: [SCREEN], current: SCREEN, main: FULL, count: 2, layout: 'side-by-side' });
  assert.deepEqual(rects, [
    { left: 320, top: 25, width: 560, height: 875 },
    { left: 880, top: 25, width: 560, height: 875 },
  ]);
  const { strip, screen } = layoutArea({ screens: [SCREEN], current: SCREEN, main: FULL, count: 2 });
  assert.equal(screen, 'current');
  assert.deepEqual(strip, { left: 0, top: 25, width: KEEP_STRIP_PX, height: 875 });
  for (const r of rects) assert.equal(overlap(r, strip), 0, 'no window over the strip');
  assert.equal(overlap(rects[0], rects[1]), 0, 'the windows do not overlap each other');
});

test('one window beside Jarvis: half his screen at most, on the far side', () => {
  assert.deepEqual(layoutRects({ screens: [SCREEN], current: SCREEN, main: FULL, count: 1, layout: 'beside' }), [{ left: 720, top: 25, width: 720, height: 875 }]);
  // The owner named the side: "the camera on the left".
  assert.deepEqual(layoutRects({ screens: [SCREEN], current: SCREEN, main: FULL, count: 1, side: 'left' }), [{ left: 0, top: 25, width: 720, height: 875 }]);
  const strip = layoutArea({ screens: [SCREEN], current: SCREEN, main: FULL, count: 1, side: 'left' }).strip;
  assert.ok(strip.width >= KEEP_STRIP_PX && strip.left + strip.width === 1440, `on the left, his right strip stays (${JSON.stringify(strip)})`);
});

test('three and four windows: a grid (the third spans the bottom row)', () => {
  const three = layoutRects({ screens: [SCREEN], current: SCREEN, main: FULL, count: 3, layout: 'grid' });
  assert.deepEqual(three, [
    { left: 320, top: 25, width: 560, height: 437 },
    { left: 880, top: 25, width: 560, height: 437 },
    { left: 320, top: 462, width: 1120, height: 437 },
  ]);
  const four = layoutRects({ screens: [SCREEN], current: SCREEN, main: FULL, count: 4 });
  assert.equal(four.length, 4);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.equal(overlap(four[i], four[j]), 0, `windows ${i} and ${j} do not overlap`);
  assert.equal(layoutRects({ screens: [SCREEN], current: SCREEN, main: FULL, count: 9 }).length, MAX_WINDOWS, 'at most four');
  assert.equal(layoutRects({ screens: [SCREEN], current: SCREEN, main: FULL, count: 0 }).length, 1, 'at least one');
});

test('room beside Jarvis: his window is not covered at all', () => {
  const main = { left: 0, top: 25, width: 700, height: 875 };
  const [one] = layoutRects({ screens: [SCREEN], current: SCREEN, main, count: 1 });
  assert.equal(overlap(one, main), 0, `one window beside him (${JSON.stringify(one)})`);
  assert.deepEqual(layoutArea({ screens: [SCREEN], current: SCREEN, main, count: 1 }).strip, { left: 0, top: 25, width: 700, height: 875 }, 'all of him in view');
  // Two windows need two columns of 480: not enough room, so they cover him except the strip.
  const two = layoutRects({ screens: [SCREEN], current: SCREEN, main, count: 2 });
  const strip = layoutArea({ screens: [SCREEN], current: SCREEN, main, count: 2 }).strip;
  assert.equal(strip.width, KEEP_STRIP_PX);
  for (const r of two) assert.equal(overlap(r, strip), 0);
});

test('Jarvis on the right of his screen: the windows go left, his right strip stays', () => {
  const main = { left: 600, top: 25, width: 840, height: 875 };
  const rects = layoutRects({ screens: [SCREEN], current: SCREEN, main, count: 2 });
  const { strip, side } = layoutArea({ screens: [SCREEN], current: SCREEN, main, count: 2 });
  assert.equal(side, 'left');
  assert.equal(strip.left + strip.width, 1440);
  assert.ok(strip.width >= KEEP_STRIP_PX);
  for (const r of rects) assert.equal(overlap(r, strip), 0);
  assert.ok(rects[0].left < rects[1].left, 'left to right');
});

test('the other monitor first: Jarvis stays in full view on his own screen', () => {
  const screens = [LAPTOP, DELL];
  assert.deepEqual(layoutRects({ screens, current: LAPTOP, main: FULL, count: 1 }), [{ left: 1440, top: 0, width: 2560, height: 1415 }]);
  const two = layoutRects({ screens, current: LAPTOP, main: FULL, count: 2 });
  assert.deepEqual(two, [
    { left: 1440, top: 0, width: 1280, height: 1415 },
    { left: 2720, top: 0, width: 1280, height: 1415 },
  ]);
  for (const r of two) assert.equal(overlap(r, FULL), 0, 'nothing on the laptop');
  assert.equal(layoutArea({ screens, current: LAPTOP, main: FULL, count: 2 }).screen, 'other');
  // Jarvis on the big monitor: the laptop is the other one.
  const onDell = layoutRects({ screens, current: DELL, main: { left: 1440, top: 0, width: 2560, height: 1415 }, count: 2 });
  for (const r of onDell) assert.ok(inside(r, { left: 0, top: 25, width: 1440, height: 875 }), `on the laptop (${JSON.stringify(r)})`);
});

test('no rect of Jarvis\'s: he is taken to fill his screen; rects are whole pixels inside the usable area', () => {
  const rects = layoutRects({ screens: [SCREEN], current: SCREEN, main: null, count: 2 });
  assert.deepEqual(rects.map((r) => r.left), [320, 880]);
  for (let n = 1; n <= 4; n++) {
    for (const main of [FULL, { left: 100, top: 40, width: 900, height: 700 }, { left: 1000, top: 25, width: 440, height: 500 }, { left: -200, top: 25, width: 900, height: 875 }]) {
      const rs = layoutRects({ screens: [SCREEN], current: SCREEN, main, count: n });
      const { strip } = layoutArea({ screens: [SCREEN], current: SCREEN, main, count: n });
      const visible = Math.min(main.left + main.width, 1440) - Math.max(main.left, 0);
      assert.ok(strip && strip.width >= Math.min(KEEP_STRIP_PX, visible), `n=${n} ${JSON.stringify(main)}: a strip of him stays (${JSON.stringify(strip)})`);
      for (const r of rs) {
        assert.ok(whole(r), 'whole pixels');
        assert.ok(inside(r, { left: 0, top: 25, width: 1440, height: 875 }), `inside the screen (${JSON.stringify(r)})`);
        assert.equal(overlap(r, strip), 0, `n=${n}: never over his strip`);
      }
    }
  }
});

test('windowRect: a window\'s own place on the desktop', () => {
  assert.deepEqual(windowRect({ screenX: 10, screenY: 30, outerWidth: 1200, outerHeight: 800 }), { left: 10, top: 30, width: 1200, height: 800 });
  assert.equal(windowRect({ screenX: 0, screenY: 0, outerWidth: 0, outerHeight: 0 }), null, 'a window with no size (hidden in a test)');
  assert.equal(windowRect(null), null);
});
