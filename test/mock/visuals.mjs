// Mock behavior for the lead tools version 4 (holograms, blueprints, the saved library). See
// test/mock/README.md for the directives:
//   [[hologram:battery|alternator|camry]]  stream a show_hologram call with that prototype sample
//   [[hologram:broken]]                    stream a show_hologram call nothing of which can be shown
//   [[hologram:huge]]                      stream a show_hologram call far beyond every limit (~140 kB)
//   a "Blueprint request" block in the turn context: stream draw_blueprint with the best-matching
//                                          sample sheet and the requested `for`
//   [[blueprint:<sample>]]                 stream draw_blueprint with that sample (no request block)
//   [[open-saved]]                         open_saved with the first id of the turn context's saved list
// After the tool_result: one or two sentences (a Blueprint mission's research synthesis when agents
// ran first). Only tools the request defines are ever called, as with the real API.

import { readFileSync } from 'node:fs';
import { newToolUseId, truncate } from './util.mjs';

export const HOLOGRAM_SAMPLES = Object.freeze(['battery', 'alternator', 'camry']);
export const BLUEPRINT_SAMPLES = Object.freeze(['alternator-part', 'battery-cutaway', 'battery-process', 'camry-assembly']);
export const VISUAL_TOOL_NAMES = Object.freeze(['show_hologram', 'draw_blueprint', 'open_saved']);

/** A JSON body that names nothing that can be shown (every shape is invalid). */
const BROKEN_HOLOGRAM = Object.freeze({
  title: 'Broken hologram',
  parts: [{ id: 'nothing', name: 'Nothing', info: 'Every shape of this part is invalid.', shapes: [{ type: 'warp-drive' }, { type: 'box', size: [0, 0, 0] }] }],
});

/** A spec far beyond every limit: 95 parts x 6 shapes, over-long text, an invalid tone on every part. */
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

const cache = new Map();

/** A fresh copy of a sample from test/mock/fixtures/ (shared with the engine and UI tests). */
export function loadFixture(name) {
  if (!cache.has(name)) cache.set(name, readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
  return JSON.parse(cache.get(name));
}

export function hasTool(body, name) {
  return Array.isArray(body?.tools) && body.tools.some((t) => t && t.name === name);
}

/** The raw text inside the <turn_context> block of a user message ('' when it has none). */
export function turnContextText(message) {
  const blocks = typeof message?.content === 'string'
    ? [message.content]
    : (Array.isArray(message?.content) ? message.content : []).filter((b) => b?.type === 'text').map((b) => b.text);
  for (const t of blocks) {
    const m = String(t).match(/<turn_context>([\s\S]*?)<\/turn_context>/);
    if (m) return m[1];
  }
  return '';
}

/** Ids of the "Saved holograms and blueprints" list, in order. */
export function savedIdsOf(ctxText) {
  const start = ctxText.indexOf('Saved holograms and blueprints');
  if (start < 0) return [];
  const ids = [];
  for (const line of ctxText.slice(start).split('\n').slice(1)) {
    const m = /^- (lib_[a-z0-9]{6,16}) · /.exec(line);
    if (!m) break;
    ids.push(m[1]);
  }
  return ids;
}

/** The "Blueprint request" block: { model, part, partName, title } or null. */
export function blueprintRequestOf(ctxText) {
  const start = ctxText.indexOf('Blueprint request');
  if (start < 0) return null;
  const block = ctxText.slice(start);
  let ids = null;
  const m = /"for":\s*(\{[^}\n]*\})/.exec(block);
  if (m) {
    try {
      ids = JSON.parse(m[1]);
    } catch {
      ids = null;
    }
  }
  const target = /^- Target: part "([^"]*)"(?: \(id: ([a-z0-9_-]+)\))?/m.exec(block);
  const title = /saved hologram lib_[a-z0-9]+, "([^"]*)"/.exec(block);
  return {
    model: typeof ids?.model === 'string' ? ids.model : null,
    part: typeof ids?.part === 'string' ? ids.part : null,
    partName: target ? target[1] : '',
    title: title ? title[1] : '',
  };
}

/**
 * The sample sheet that best matches a request: a part gets a part sheet (the AA cell's parts its
 * cutaway); a whole object its assembly or cutaway; "how it's made" its process sheet.
 */
export function chooseBlueprintSample({ part = null, partName = '', title = '', prompt = '' } = {}) {
  const what = `${part || ''} ${partName}`.toLowerCase();
  const object = `${title} ${prompt}`.toLowerCase();
  const made = /\b(made|make|manufactur\w*|process|production|factory|plant|built)\b/.test(prompt.toLowerCase());
  if (part) {
    if (/\b(batter\w*|cell|anode|cathode|zinc|separator|electrolyte|collector)\b/.test(what) && !/hybrid|traction|12 ?v|hv/.test(what)) return 'battery-cutaway';
    if (/\b(batter\w*|cell|anode|cathode|zinc|separator)\b/.test(object) && !/camry|car|toyota|vehicle/.test(object)) return 'battery-cutaway';
    return 'alternator-part';
  }
  const name = title.toLowerCase();
  const alternator = /alternator/.test(name); // the object itself ("Car alternator"), not a car
  const car = !alternator && /camry|toyota|\bcar\b|sedan|vehicle/.test(object);
  const battery = !alternator && /batter|\baa\b|lr6|alkaline/.test(object);
  if (made) return car ? 'camry-assembly' : battery ? 'battery-process' : alternator ? 'alternator-part' : 'camry-assembly';
  if (car) return 'camry-assembly';
  if (battery) return 'battery-cutaway';
  return 'alternator-part';
}

const text = (t) => ({ type: 'text', text: t, citations: null });

/** One streamed show_hologram call (realistic, visible pacing for the live build). */
export function hologramPlan({ think, sample, intro }) {
  const input = sample === 'broken' ? JSON.parse(JSON.stringify(BROKEN_HOLOGRAM)) : sample === 'huge' ? hugeHologram() : loadFixture(sample);
  return {
    blocks: [
      think(`The owner wants to see ${input.title}. I'll build the hologram: the big recognizable structure first, then the smaller and inner parts, every part labeled.`),
      text(intro || `Here is ${input.title} as a hologram; it builds part by part.`),
      { type: 'tool_use', id: newToolUseId(), name: 'show_hologram', input },
    ],
    stop_reason: 'tool_use',
    pace: 'hologram',
    jsonChunk: 28,
  };
}

/** One streamed draw_blueprint call with a sample sheet, linked to `forIds` when given. */
export function blueprintPlan({ think, sample, forIds, partName }) {
  const sheet = loadFixture(sample);
  const input = forIds && forIds.model ? { ...sheet, for: forIds.part ? { model: forIds.model, part: forIds.part } : { model: forIds.model } } : sheet;
  const what = partName || sheet.title;
  return {
    blocks: [
      think(`The owner asked for the 2D blueprint of ${what}. One sheet, drawn once, with the parts numbered against the list.`),
      text(`Drawing the 2D blueprint of ${what} now.`),
      { type: 'tool_use', id: newToolUseId(), name: 'draw_blueprint', input },
    ],
    stop_reason: 'tool_use',
    pace: 'hologram',
    jsonChunk: 28,
  };
}

/** open_saved with the first id of the saved list (an unknown id when the list is empty). */
export function openSavedPlan({ think, ids }) {
  const id = ids[0] || 'lib_0000000000';
  return {
    blocks: [
      think(ids.length ? `The owner's library already has this (${id}); reopening it costs nothing.` : 'Nothing is saved yet; I will try the id anyway.'),
      { type: 'tool_use', id: newToolUseId(), name: 'open_saved', input: { id } },
    ],
    stop_reason: 'tool_use',
    pace: 'quick',
  };
}

const quoted = (s) => `“${truncate(String(s || '').replace(/\s+/g, ' ').trim(), 80)}”`;

/** The one or two sentences after a show_hologram / draw_blueprint / open_saved result. */
export function visualFollowUpText(use, result, resultText) {
  const failed = result?.is_error === true;
  if (use.name === 'show_hologram') {
    if (failed) return `I couldn't build that hologram: ${truncate(resultText.split('\n').slice(1).join(' ') || resultText, 160)}`;
    const parts = Array.isArray(use.input?.parts) ? use.input.parts.length : 0;
    return `There it is: ${quoted(use.input?.title)}, with ${parts} labeled parts. Tap any part for details, or say "expand" to take it apart.`;
  }
  if (use.name === 'draw_blueprint') {
    if (failed) return `I couldn't draw that blueprint: ${truncate(resultText, 160)}`;
    return `Here is the 2D blueprint of ${quoted(use.input?.title)}. Tap a numbered callout to see that part.`;
  }
  if (failed) return 'I couldn’t find that in your saved library, so nothing was opened. Shall I build it again?';
  const m = /^Opened the saved (hologram|blueprint) "([^"]*)"/.exec(resultText);
  return m ? `I've reopened your saved ${m[1]} ${quoted(m[2])}: no need to build it again.` : 'I have reopened it from your library.';
}
