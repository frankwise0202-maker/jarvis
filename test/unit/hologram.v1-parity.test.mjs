// Old holograms render exactly as before. A saved hologram (format v1: made with show_hologram
// version 1, in any conversation) is validated again when it opens and drawn by the renderer that
// now also draws format v2. Its normalized spec (with the warnings and stats of the tool_result) and
// every byte of its geometry (fills and edge lines, sweep times and heights, bounds and fitting
// points) are pinned to what Jarvis v7.2 produced before format v2 (9c5b8a1), at every detail level
// the new triangle budget can pick, and its edge lines keep full strength (aW 1: the line shader's
// new weight changes nothing for them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadFixture } from '../mock/visuals.mjs';
import { normalizeHologramSpec } from '../../src/lib/hologram-spec.js';
import { buildShapeChunk, mergeChunks } from '../../src/ui/hologram/geometry.js';

// sha256 digests computed with the v7.2 release (9c5b8a1) validator and geometry
const PINNED_V72 = {
  battery: { spec: '84a218d31dd9b0b3f9d6cf2f43e9c15faf78d52f4bb36ce378604f75521818fd', geometry: 'bd9e41b7726a8a00bdd97b99fa4ec78b481ad7112fac1764a77bb5b913934710' },
  alternator: { spec: '537b743588d0c396cd82258a9f99e0ec74e7b01522d998968c9f5f23ce24c824', geometry: '5d4720d199645c03fdfad965104057a13480f66a5fd65c98afa80d3c7e019c1e' },
  camry: { spec: '88cf6a14d7c8dde90a3a817ec4ae93784d0def5c0fc19ca1a282a45f2d2e012d', geometry: 'c7f76663c406cd47fb712e23b9ff8239afeced3c5823520d83d2b29a46e7e8f9' },
  huge: { spec: '3a49aba24b3c8f6ad57c4b8914f925cdec6b9c79d0a90ffd95cd28585157f587', geometry: '8d493acb2c7794847927d4c376d792b72b645116395afcbdafe6537fb3f71c0c' },
  broken: { spec: '7eadb8e055a787380d7b5c707ac669ccad33099a401fa7e2f048c31082016213', geometry: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
};

/** The mock's stress spec (test/mock/visuals.mjs: [[hologram:huge]]): 95 parts x 6 cylinders, over-long text. */
function hugeHologram() {
  return {
    title: `Stress test ${'T'.repeat(300)}`,
    subtitle: 'S'.repeat(400),
    notes: Array.from({ length: 12 }, (_, i) => `Note ${i} ${'n'.repeat(300)}`),
    parts: Array.from({ length: 95 }, (_, i) => ({
      id: `part-${i}`,
      name: `Part number ${i} with a label far longer than any label should be`,
      tone: 'neon',
      info: `Info ${i} ${'i'.repeat(700)}`,
      material: 'm'.repeat(150),
      explode: [0, i * 5, 0],
      shapes: Array.from({ length: 6 }, (_, j) => ({ type: 'cylinder', at: [i * 12, j * 12, 0], r: 4, h: 10, axis: 'x' })),
    })),
  };
}
/** The mock's [[hologram:broken]]: nothing in it can be shown. */
const BROKEN = {
  title: 'Broken hologram',
  parts: [{ id: 'nothing', name: 'Nothing', info: 'Every shape of this part is invalid.', shapes: [{ type: 'warp-drive' }, { type: 'box', size: [0, 0, 0] }] }],
};

const SAMPLES = {
  battery: () => loadFixture('battery'),
  alternator: () => loadFixture('alternator'),
  camry: () => loadFixture('camry'),
  huge: hugeHologram,
  broken: () => structuredClone(BROKEN),
};

const ATTRS = { fill: ['position', 'normal', 'aBorn', 'aH'], lines: ['position', 'aBorn', 'aH'] };

/** The digests of one spec: as validated, and as built (ctx: what the renderer passes, or none as in v7.2). */
function digest(raw, ctx) {
  const res = normalizeHologramSpec(raw);
  const spec = createHash('sha256').update(JSON.stringify({ ok: res.ok, spec: res.spec, warnings: res.warnings, stats: res.stats })).digest('hex');
  const g = createHash('sha256');
  const weights = [];
  for (const part of res.spec ? res.spec.parts : []) {
    const chunks = part.shapes.map((s) => (ctx ? buildShapeChunk(s, ctx) : buildShapeChunk(s)));
    const m = mergeChunks(chunks, chunks.map((_, j) => j * 0.01));
    for (const kind of ['fill', 'lines']) {
      const geo = m[kind];
      g.update(`${part.id}:${kind}:${geo ? 1 : 0}`);
      if (!geo) continue;
      for (const a of ATTRS[kind]) g.update(Buffer.from(geo.getAttribute(a).array.buffer));
      if (kind === 'fill') g.update(Buffer.from(Uint32Array.from(geo.getIndex().array).buffer));
    }
    g.update(JSON.stringify(m.box));
    g.update(Buffer.from(m.support.buffer));
    if (m.lines) weights.push(...new Set(m.lines.getAttribute('aW').array));
  }
  return { spec, geometry: g.digest('hex'), weights: [...new Set(weights)], res };
}

test('old holograms validate exactly as in v7.2 (spec, warnings and stats), and again unchanged when reopened', () => {
  for (const [name, make] of Object.entries(SAMPLES)) {
    const d = digest(make());
    assert.equal(d.spec, PINNED_V72[name].spec, `${name}: validated as in v7.2`);
    if (!d.res.ok) continue; // (never saved)
    // a saved hologram is validated again when it opens: nothing changes
    const again = normalizeHologramSpec(structuredClone(d.res.spec));
    assert.deepEqual(again.spec, d.res.spec, `${name}: re-validated unchanged`);
    assert.deepEqual(again.warnings, [], name);
  }
});

test('old holograms build exactly the v7.2 geometry at every detail level, with full-strength lines', () => {
  for (const [name, make] of Object.entries(SAMPLES)) {
    // as v7.2 built them (no context), and with the context the renderer passes now: the detail
    // levels of the triangle budget (0-2), the model's size and the hull hosts never touch them
    const contexts = [null, ...[0, 1, 2].map((level) => ({ level, hullMode: null, scale: 4096, hosts: () => [] })), { level: 2, hullMode: 'coarse', scale: 724, hosts: () => [] }];
    for (const ctx of contexts) {
      const d = digest(make(), ctx);
      assert.equal(d.geometry, PINNED_V72[name].geometry, `${name} ${JSON.stringify(ctx && { level: ctx.level, hullMode: ctx.hullMode })}: the v7.2 geometry`);
      assert.ok(d.weights.every((w) => w === 1), `${name}: line weights ${d.weights}`);
    }
  }
});
