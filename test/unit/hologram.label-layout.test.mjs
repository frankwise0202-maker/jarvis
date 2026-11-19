import { test } from 'node:test';
import assert from 'node:assert/strict';
// Hologram label decluttering (src/ui/hologram/label-layout.js): no overlaps, priorities,
// hysteresis, leader crossings and speed.
import { layoutLabels, SLOTS } from '../../src/ui/hologram/label-layout.js';

// Deterministic pseudo-random scenes
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function scene(n, { w = 390, h = 844, seed = 1, spread = 0.5 } = {}) {
  const rand = rng(seed);
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push({
      id: `p${i}`,
      x: w / 2 + (rand() - 0.5) * w * spread,
      y: h / 2 + (rand() - 0.5) * h * spread * 0.6,
      w: 40 + Math.round(rand() * 110),
      h: 18,
      priority: rand() * 100,
    });
  }
  return items;
}

const overlap = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

function check(items, placed, bounds) {
  const boxes = Array.from(placed.entries());
  for (const [id, p] of boxes) {
    assert.ok(p.x >= bounds.left - 0.01 && p.y >= bounds.top - 0.01, `${id} inside top/left`);
    assert.ok(p.x + p.w <= bounds.right + 0.01 && p.y + p.h <= bounds.bottom + 0.01, `${id} inside bottom/right`);
    // leader end is on the label box
    assert.ok(p.lx >= p.x - 0.01 && p.lx <= p.x + p.w + 0.01 && p.ly >= p.y - 0.01 && p.ly <= p.y + p.h + 0.01);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i][1].forced || boxes[j][1].forced) continue;
      assert.ok(!overlap(boxes[i][1], boxes[j][1]), `${boxes[i][0]} overlaps ${boxes[j][0]}`);
    }
  }
}

test('no overlaps, inside bounds, across many random scenes and sizes', () => {
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [1440, 900],
  ]) {
    const bounds = { left: 4, top: 100, right: w - 4, bottom: h - 160 };
    for (let seed = 1; seed <= 40; seed++) {
      const items = scene(10 + (seed % 5) * 15, { w, h, seed });
      const placed = layoutLabels(items, bounds, {});
      check(items, placed, bounds);
    }
  }
});

test('priority decides who is shown when crowded; the pinned item always is', () => {
  const bounds = { left: 0, top: 0, right: 300, bottom: 200 };
  const items = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, x: 150 + (i % 6), y: 100 + (i % 4), w: 120, h: 18, priority: i }));
  items[3].pinned = true;
  const placed = layoutLabels(items, bounds, {});
  assert.ok(placed.has('p3'), 'pinned shown');
  assert.ok(placed.size < items.length, 'some hidden');
  const shown = Array.from(placed.keys()).filter((id) => id !== 'p3').map((id) => Number(id.slice(1)));
  const hidden = items.map((_, i) => i).filter((i) => !placed.has(`p${i}`));
  assert.ok(Math.min(...shown) > Math.max(...hidden) - 6, 'higher priority labels win');
});

test('labels never cover the anchor of a higher-priority label or their own, and rarely any other', () => {
  const bounds = { left: 0, top: 0, right: 600, bottom: 600 };
  let soft = 0;
  let pairs = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const items = scene(30, { w: 600, h: 600, seed, spread: 0.7 });
    const placed = layoutLabels(items, bounds, {});
    const byId = new Map(items.map((it) => [it.id, it]));
    for (const [id, p] of placed) {
      const me = byId.get(id);
      for (const it of items) {
        if (!placed.has(it.id)) continue;
        const inside = it.x > p.x + 1 && it.x < p.x + p.w - 1 && it.y > p.y + 1 && it.y < p.y + p.h - 1;
        if (it === me || it.priority > me.priority) assert.ok(!inside, `${id} covers the anchor of ${it.id}`);
        else if (inside) soft++;
        pairs++;
      }
    }
  }
  assert.ok(soft / pairs < 0.01, `${soft} soft covers`);
});

test('labels prefer to sit beside the parts (avoid boxes) when that is cheap', () => {
  const bounds = { left: 0, top: 0, right: 390, bottom: 700 };
  // a tall narrow object in the middle with anchors on its axis
  const avoid = [[175, 100, 215, 600]];
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, x: 195, y: 130 + i * 60, w: 110, h: 18, priority: 10 - i }));
  const placed = layoutLabels(items, bounds, { avoid, center: { x: 195, y: 350 } });
  assert.equal(placed.size, 8);
  const [x0, y0, x1, y1] = avoid[0];
  for (const p of placed.values()) assert.ok(p.x + p.w <= x0 || p.x >= x1 || p.y + p.h <= y0 || p.y >= y1, 'beside the object, not on it');
});

test('hysteresis: a label keeps its spot while its anchor drifts a little', () => {
  const bounds = { left: 0, top: 0, right: 800, bottom: 600 };
  const items = scene(25, { w: 800, h: 600, seed: 7 });
  const prev = new Map();
  let placed = layoutLabels(items, bounds, { previous: prev });
  for (const [id, p] of placed) prev.set(id, p.slot);
  let kept = 0;
  let total = 0;
  for (let step = 1; step <= 10; step++) {
    const moved = items.map((it) => ({ ...it, x: it.x + step * 0.8, y: it.y - step * 0.5 }));
    placed = layoutLabels(moved, bounds, { previous: prev });
    for (const [id, p] of placed) {
      if (prev.has(id)) {
        total++;
        if (prev.get(id) === p.slot) kept++;
      }
      prev.set(id, p.slot);
    }
  }
  assert.ok(kept / total > 0.9, `kept ${kept}/${total}`);
});

test('maxCost hides labels that would need a long leader; pinned ignore it', () => {
  const bounds = { left: 0, top: 0, right: 400, bottom: 400 };
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, x: 200, y: 200, w: 100, h: 18, priority: i, pinned: i === 0 }));
  const all = layoutLabels(items, bounds, {});
  const capped = layoutLabels(items, bounds, { maxCost: 60 });
  assert.ok(capped.size < all.size);
  assert.ok(capped.has('p0'));
});

test('ignores invalid items and handles empty input', () => {
  const bounds = { left: 0, top: 0, right: 100, bottom: 100 };
  assert.equal(layoutLabels([], bounds).size, 0);
  const placed = layoutLabels(
    [
      { id: 'a', x: NaN, y: 1, w: 10, h: 10, priority: 1 },
      { id: 'b', x: 5, y: 5, w: 0, h: 10, priority: 1 },
      { id: 'c', x: 500, y: 500, w: 10, h: 10, priority: 1 }, // anchor off-screen
      { id: 'd', x: 50, y: 50, w: 20, h: 12, priority: 1 },
    ],
    bounds,
  );
  assert.deepEqual(Array.from(placed.keys()), ['d']);
});

test('fast enough to run every frame (80 labels)', () => {
  const bounds = { left: 0, top: 80, right: 1440, bottom: 760 };
  const items = scene(80, { w: 1440, h: 900, seed: 3, spread: 0.6 });
  const avoid = items.slice(0, 40).map((it) => [it.x - 30, it.y - 30, it.x + 30, it.y + 30]);
  const prev = new Map();
  layoutLabels(items, bounds, { avoid, previous: prev }); // warm up
  // The cost of the algorithm, not of a busy machine: the fastest of five batches of 20 layouts
  // (other test files and workflows share the CPU; a batch they interrupt is not the measure).
  let ms = Infinity;
  for (let batch = 0; batch < 5; batch++) {
    const t = performance.now();
    for (let i = 0; i < 20; i++) layoutLabels(items, bounds, { avoid, previous: prev });
    ms = Math.min(ms, (performance.now() - t) / 20);
  }
  assert.ok(ms < 6, `${ms.toFixed(2)} ms per layout`);
  assert.equal(SLOTS.length, 84);
});
