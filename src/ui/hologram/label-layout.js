// Label placement for the hologram's callouts. Pure (no DOM), so it is unit-tested in Node.
//
//   const placed = layoutLabels(items, bounds, { center, previous });
//
// items: [{ id, x, y, w, h, priority, pinned }]
//   x, y      the part's anchor on screen (CSS px); the leader line starts there
//   w, h      the label's size (CSS px)
//   priority  higher is placed first (the hologram uses on-screen size); pinned (the selected part)
//             always goes first and is shown even when it has to overlap something
// bounds: { left, top, right, bottom } the area labels must stay inside (the view minus toolbars)
// options:
//   center    { x, y } the object's center on screen: labels are pushed outward from it, which
//             keeps leaders short and mostly uncrossed in exploded views
//   previous  Map id -> slot index from the last layout: kept when still free, so labels do not
//             jump between equivalent spots while the model turns
//   gap       min px between labels (default 3)
//   maxCost   labels whose best spot costs more are hidden (pinned ones never are)
//   coverCost cost of covering a part (default COVER_COST); the hologram raises it for compact
//             (assembled) models so their labels go outside like callouts
//   avoid     [[x0, y0, x1, y1], ...] screen boxes of parts: covering one costs extra (COVER_COST),
//             so labels sit beside the model when that only means a slightly longer leader
//
// Returns Map id -> { x, y, w, h, slot, lx, ly, forced } with the box's top-left corner and the
// point where the leader meets the box. Items left out are hidden this frame (too crowded).
//
// Method: greedy by priority. Each label considers candidate spots around its anchor (rings at
// growing distances, angles fanning out from the outward direction). Hard rules: inside the
// bounds, no overlap with a placed label, no placed anchor covered. Soft costs: distance and
// angle, covering a part (COVER_COST) or a later label's anchor (ANCHOR_COST), the leader crossing
// a placed leader or running through a placed label (CROSS_COST); the previous spot gets a bonus
// (STAY_BONUS) so labels do not jump
// while the model turns. Spots are visited cheapest-first and the search stops once no remaining
// spot can beat the best found, so a typical frame costs well under a millisecond.

const RADII = [16, 30, 48, 72, 104, 144, 196];
const ANGLES = [0, 20, -20, 42, -42, 66, -66, 95, -95, 130, -130, 180];
const DEG = Math.PI / 180;
const ANGLE_COST = 0.55; // per degree away from the outward direction
const COVER_COST = 80; // the box covers a part
const ANCHOR_COST = 45; // the box covers another part's anchor dot (one still to be placed)
const CROSS_COST = 110; // the leader crosses a placed leader or runs under a placed label
const STAY_BONUS = 26;

/** Candidate spots, cheapest first: { r, da, cost } (radius px, angle offset rad, base cost). */
export const SLOTS = (() => {
  const list = [];
  for (const r of RADII) for (const a of ANGLES) list.push({ r, da: a * DEG, cost: r + Math.abs(a) * ANGLE_COST });
  list.sort((p, q) => p.cost - q.cost);
  return list;
})();

function hashAngle(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360) * DEG;
}

function boxAt(item, slot, base) {
  const a = base + slot.da;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const px = item.x + slot.r * c;
  const py = item.y + slot.r * s;
  const x = c > 0.38 ? px : c < -0.38 ? px - item.w : px - item.w / 2;
  const y = s > 0.38 ? py : s < -0.38 ? py - item.h : py - item.h / 2;
  return { x, y };
}

export function layoutLabels(items, bounds, options = {}) {
  const gap = options.gap ?? 3;
  const center = options.center || { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const previous = options.previous || null;
  const avoid = options.avoid || [];
  const maxCost = options.maxCost ?? Infinity;
  const coverCost = options.coverCost ?? COVER_COST;
  const order = items
    .filter((it) => Number.isFinite(it.x) && Number.isFinite(it.y) && it.w > 0 && it.h > 0)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.priority - a.priority);
  const placedBoxes = []; // [x0, y0, x1, y1]
  const anchors = []; // [x, y]
  const leaders = []; // [ax, ay, lx, ly]
  const out = new Map();

  const fits = (x, y, w, h, self) => {
    if (x < bounds.left || y < bounds.top || x + w > bounds.right || y + h > bounds.bottom) return false;
    const x0 = x - gap;
    const y0 = y - gap;
    const x1 = x + w + gap;
    const y1 = y + h + gap;
    for (let i = 0; i < placedBoxes.length; i++) {
      const b = placedBoxes[i];
      if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return false;
    }
    for (let i = 0; i < anchors.length; i++) {
      const p = anchors[i];
      if (p[0] > x - 2 && p[0] < x + w + 2 && p[1] > y - 2 && p[1] < y + h + 2) return false;
    }
    // never cover its own anchor (the leader would vanish)
    if (self.x > x - 2 && self.x < x + w + 2 && self.y > y - 2 && self.y < y + h + 2) return false;
    return true;
  };
  const clearOfParts = (x, y, w, h) => {
    for (let i = 0; i < avoid.length; i++) {
      const b = avoid[i];
      if (x < b[2] && x + w > b[0] && y < b[3] && y + h > b[1]) return false;
    }
    return true;
  };
  const pendingAnchors = order.map((it) => [it.x, it.y, it]);
  const coversPendingAnchor = (x, y, self) => {
    for (let i = 0; i < pendingAnchors.length; i++) {
      const [ax, ay, it] = pendingAnchors[i];
      if (it === self) continue;
      if (ax > x - 2 && ax < x + self.w + 2 && ay > y - 2 && ay < y + self.h + 2) return true;
    }
    return false;
  };
  const leaderEnd = (item, x, y) => [Math.min(Math.max(item.x, x), x + item.w), Math.min(Math.max(item.y, y), y + item.h)];
  const uncrossed = (item, x, y) => {
    const [lx, ly] = leaderEnd(item, x, y);
    for (let i = 0; i < leaders.length; i++) if (segmentsCross(item.x, item.y, lx, ly, leaders[i])) return false;
    // the new label must not sit on an existing leader either
    for (let i = 0; i < leaders.length; i++) if (segmentHitsBox(leaders[i], x - 1, y - 1, x + item.w + 1, y + item.h + 1)) return false;
    return true;
  };

  for (const item of order) {
    const insideView = item.x >= bounds.left - 1 && item.x <= bounds.right + 1 && item.y >= bounds.top - 1 && item.y <= bounds.bottom + 1;
    if (!insideView && !item.pinned) continue;
    const dx = item.x - center.x;
    const dy = item.y - center.y;
    const base = Math.hypot(dx, dy) < 6 ? hashAngle(item.id) : Math.atan2(dy, dx);
    let chosen = null;
    let chosenSlot = -1;
    const prev = previous ? previous.get(item.id) : undefined;
    let best = item.pinned ? Infinity : maxCost;
    for (let k = 0; k < SLOTS.length; k++) {
      const slot = SLOTS[k];
      const bonus = k === prev ? STAY_BONUS : 0;
      if (slot.cost - STAY_BONUS >= best) break; // nothing further can win
      const p = boxAt(item, slot, base);
      if (!fits(p.x, p.y, item.w, item.h, item)) continue;
      let cost = slot.cost - bonus;
      if (cost >= best) continue;
      if (avoid.length && !clearOfParts(p.x, p.y, item.w, item.h)) cost += coverCost;
      if (cost >= best) continue;
      if (coversPendingAnchor(p.x, p.y, item)) cost += ANCHOR_COST;
      if (cost >= best) continue;
      if (!uncrossed(item, p.x, p.y)) cost += CROSS_COST;
      if (cost < best) {
        best = cost;
        chosen = p;
        chosenSlot = k;
      }
    }
    let forced = false;
    if (!chosen) {
      if (!item.pinned) continue;
      // The selected part is always labeled: nearest outward spot, clamped into the bounds.
      const p = boxAt(item, SLOTS[2], base);
      p.x = Math.min(Math.max(p.x, bounds.left), Math.max(bounds.left, bounds.right - item.w));
      p.y = Math.min(Math.max(p.y, bounds.top), Math.max(bounds.top, bounds.bottom - item.h));
      chosen = p;
      chosenSlot = 2;
      forced = true;
    }
    placedBoxes.push([chosen.x, chosen.y, chosen.x + item.w, chosen.y + item.h]);
    anchors.push([item.x, item.y]);
    const [lx, ly] = leaderEnd(item, chosen.x, chosen.y);
    leaders.push([item.x, item.y, lx, ly]);
    out.set(item.id, { x: chosen.x, y: chosen.y, w: item.w, h: item.h, slot: chosenSlot, lx, ly, forced });
  }
  return out;
}

function cross(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Proper intersection of segment (x1,y1)-(x2,y2) with segment s = [x3, y3, x4, y4]. */
function segmentsCross(x1, y1, x2, y2, s) {
  const [x3, y3, x4, y4] = s;
  const d1 = cross(x3, y3, x4, y4, x1, y1);
  const d2 = cross(x3, y3, x4, y4, x2, y2);
  const d3 = cross(x1, y1, x2, y2, x3, y3);
  const d4 = cross(x1, y1, x2, y2, x4, y4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Does segment s = [x1, y1, x2, y2] pass through the box? */
function segmentHitsBox(s, bx0, by0, bx1, by1) {
  const [x1, y1, x2, y2] = s;
  const inside = (x, y) => x > bx0 && x < bx1 && y > by0 && y < by1;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  return (
    segmentsCross(x1, y1, x2, y2, [bx0, by0, bx1, by0]) ||
    segmentsCross(x1, y1, x2, y2, [bx1, by0, bx1, by1]) ||
    segmentsCross(x1, y1, x2, y2, [bx0, by1, bx1, by1]) ||
    segmentsCross(x1, y1, x2, y2, [bx0, by0, bx0, by1])
  );
}
