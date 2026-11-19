// Holograms, blueprints and the saved library in the lead turn (lead tools version 4, SPEC holograms
// §2-5): live segments from the streamed show_hologram / draw_blueprint input (like deploy_agents
// planning), the tool round (validate, save to the library, tool_result), open_saved, the
// turn-context blocks (saved items, "Blueprint request") and the one-line text export of a segment.
// No DOM access here.
//
// Segments (in turn.segments, emitted with 'segment', updated in place while the input streams):
//   { id, kind: 'hologram', req, toolUseId, status: 'building'|'done'|'error', title, subtitle,
//     spec, stats: { parts, shapes }, warnings: [], libraryId: null|'lib_…', fromLibrary }
//   { id, kind: 'blueprint', req, toolUseId, status, title, subject, sheet, spec,
//     stats: { views, shapes, primitives, callouts, parts, dimensions, steps }, warnings,
//     libraryId, for: { model, part }|null, fromLibrary }
// `spec` is always normalized (hologram-spec.js / blueprint-spec.js); while building it is the
// normalized stable prefix of the input streamed so far, so nothing shown ever changes later. A
// stopped or cut stream leaves status 'error' with what was built so far, and nothing is saved.
//
// The app's library dependency (deps.library), each function may return a value or a Promise:
//   save(record) -> { id }        record: { kind, title, subject, spec, stats, conversationId,
//                                  turnId, segmentId, parent: { model, part }|null, partName, costUsd }
//   get(id) -> item | null        item: { id, kind, title, subject, spec, stats, parent, ... }
//   list({ kind, limit }) -> rows newest first: { id, kind, title, subject, sheet, stats, parent, ... }
//   findPartBlueprint(modelId, partId|null) -> row | null

import { hologramToolResult, normalizeHologramSpec, partBounds, specBounds } from '../lib/hologram-spec.js';
import { blueprintStablePrefix, blueprintToolResult, normalizeBlueprintSpec, sheetLabel, summarizeBlueprint } from '../lib/blueprint-spec.js';
import { SAVED_ITEMS_MAX, buildBlueprintRequestBlock, buildSavedItemsBlock, withTurnContextBlocks } from './prompts.js';
import { abortError, isPlainObject, parsePartialJson, singleLine, truncate, uid } from './util.js';

export const LIBRARY_ID = /^lib_[a-z0-9]{6,16}$/;
export const PART_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
/** Live-build updates while the input streams: at most about 8 a second (and at the block's end). */
export const LIVE_INTERVAL_MS = 120;
/** The longest the engine waits for one library call before going on without it. */
export const LIBRARY_TIMEOUT_MS = 4000;
const OPEN_SUMMARY_CHARS = 1500;

const SPEC_TOOLS = { show_hologram: 'hologram', draw_blueprint: 'blueprint' };

/** Whether the conversation's frozen tools include `name` (by default open_saved: lead tools V4). */
export function hasVisualTools(conv, name = 'open_saved') {
  return !!conv && Array.isArray(conv.tools) && conv.tools.some((t) => t && t.name === name);
}

/** Whether a segment is a hologram or blueprint card. */
export function isVisualSegment(segment) {
  return !!segment && (segment.kind === 'hologram' || segment.kind === 'blueprint');
}

/** A validated blueprintFor ({ model: 'lib_…', part: '<part id>'|null }), or null when invalid. */
export function cleanBlueprintFor(value) {
  if (!isPlainObject(value)) return null;
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  const part = value.part === undefined || value.part === null || value.part === '' ? null : typeof value.part === 'string' ? value.part.trim() : undefined;
  if (!LIBRARY_ID.test(model) || part === undefined || (part !== null && !PART_ID.test(part))) return null;
  return { model, part };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** One line of text from a string (anything else is ''), capped. */
const oneLine = (s, max) => truncate(singleLine(typeof s === 'string' ? s : ''), max);

/**
 * The single line text exports (share, Markdown, copy) use for a hologram or blueprint segment,
 * e.g. '[Hologram: 2024 Toyota Camry Hybrid · 43 parts]' or '[Blueprint: Alternator · part sheet ·
 * 18 parts]'. Never the spec. '' for any other segment.
 */
export function visualExportLine(segment) {
  if (!isVisualSegment(segment)) return '';
  const title = oneLine(segment.title || segment.spec?.title || '', 80).replace(/[[\]]/g, (c) => (c === '[' ? '(' : ')')) || 'Untitled';
  const bits = [title];
  const done = segment.status === 'done';
  if (segment.kind === 'hologram') {
    const parts = Number.isInteger(segment.stats?.parts) ? segment.stats.parts : Array.isArray(segment.spec?.parts) ? segment.spec.parts.length : 0;
    bits.push(done ? plural(parts, 'part') : segment.status === 'building' ? 'building' : 'not finished');
    return `[Hologram: ${bits.join(' · ')}]`;
  }
  bits.push(sheetLabel(segment.sheet || segment.spec?.sheet));
  if (!done) bits.push(segment.status === 'building' ? 'drawing' : 'not finished');
  else if (segment.stats?.steps) bits.push(plural(segment.stats.steps, 'step'));
  else if (segment.stats?.parts) bits.push(plural(segment.stats.parts, 'part'));
  return `[Blueprint: ${bits.join(' · ')}]`;
}

/**
 * The visible text of a 2D request the UI sends with startTurn({ blueprintFor }):
 * 'Blueprint: Alternator (2024 Toyota Camry Hybrid)' for a part, 'Blueprint: <title>' for the
 * whole object. `spec` is the saved hologram's normalized spec.
 */
export function blueprintRequestText(spec, partId = null) {
  const title = oneLine(spec?.title || '', 80) || 'Hologram';
  const part = partId && Array.isArray(spec?.parts) ? spec.parts.find((p) => p && p.id === partId) : null;
  return part ? `Blueprint: ${oneLine(part.name || part.id, 40)} (${title})` : `Blueprint: ${title}`;
}

// ---------------------------------------------------------------------------------------------
// Library calls: never trusted to answer, never allowed to throw into the turn.

/** `value`, unless `ms` pass first or `signal` aborts (Stop never waits for a slow library). */
function settleWithin(value, ms, signal) {
  let timer = null;
  let onAbort = null;
  return Promise.race([
    Promise.resolve(value),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
      if (signal) {
        onAbort = () => reject(abortError());
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    }),
  ]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
}

async function callLibrary(ctx, name, ...args) {
  const lib = ctx.deps.library;
  if (!lib || typeof lib[name] !== 'function') return undefined;
  try {
    return await settleWithin(lib[name](...args), ctx.libraryTimeoutMs ?? LIBRARY_TIMEOUT_MS, ctx.signal);
  } catch (err) {
    if (err?.name !== 'AbortError') console.error(`[jarvis] library.${name} failed:`, err);
    return null;
  }
}

/** A saved hologram's normalized spec, or null (missing, not a hologram, damaged). */
async function loadHologram(ctx, id) {
  if (ctx.hologramCache?.has(id)) return ctx.hologramCache.get(id);
  const item = await callLibrary(ctx, 'get', id);
  let spec = null;
  if (isPlainObject(item) && item.kind === 'hologram') {
    const res = normalizeHologramSpec(item.spec);
    if (res.ok) spec = res.spec;
  }
  if (!ctx.hologramCache) ctx.hologramCache = new Map();
  ctx.hologramCache.set(id, spec);
  return spec;
}

// ---------------------------------------------------------------------------------------------
// Turn context (before the turn's first request)

/**
 * Completes the turn's <turn_context> with the saved-items block and, for a 2D request, the
 * "Blueprint request" block. Runs before the turn's first request (nothing of the message has been
 * sent yet), and only in conversations with the version 4 tools. The message object is replaced,
 * not edited, so storage sees the change.
 */
export async function prepareVisualTurn(ctx) {
  try {
    await addVisualBlocks(ctx);
  } catch (err) {
    // Never fail a turn over its extra context: it then simply goes without the blocks.
    console.error('[jarvis] could not add the library to the turn context:', err);
  }
}

async function addVisualBlocks(ctx) {
  const { conv, turn } = ctx;
  if (!hasVisualTools(conv)) return;
  const start = turn.apiStart;
  const message = Number.isInteger(start) ? conv.apiMessages[start] : null;
  const first = Array.isArray(message?.content) ? message.content[0] : null;
  if (!message || message.role !== 'user' || first?.type !== 'text' || !String(first.text).startsWith('<turn_context>')) return;
  const blocks = [];
  const rows = await callLibrary(ctx, 'list', { limit: SAVED_ITEMS_MAX });
  if (Array.isArray(rows)) {
    const usable = rows.filter((r) => isPlainObject(r) && typeof r.id === 'string' && LIBRARY_ID.test(r.id) && (r.kind === 'hologram' || r.kind === 'blueprint'));
    blocks.push(buildSavedItemsBlock(usable.slice(0, SAVED_ITEMS_MAX)));
  }
  const target = cleanBlueprintFor(turn.blueprintFor);
  if (target) {
    const hologram = await loadHologram(ctx, target.model);
    let partInfo = null;
    let size = null;
    if (hologram && target.part) {
      const part = hologram.parts.find((p) => p.id === target.part);
      if (part) {
        const group = part.group ? hologram.groups.find((g) => g.id === part.group)?.name || part.group : '';
        partInfo = { name: part.name, info: part.info, material: part.material, group, size: partBounds(part)?.size || null };
      }
    } else if (hologram) {
      size = specBounds(hologram)?.size || null;
    }
    const found = await callLibrary(ctx, 'findPartBlueprint', target.model, target.part);
    const existing = isPlainObject(found) && typeof found.id === 'string' && LIBRARY_ID.test(found.id) ? found.id : null;
    blocks.push(buildBlueprintRequestBlock({ model: target.model, part: target.part, hologram, partInfo, size, existing }));
  }
  const text = withTurnContextBlocks(first.text, blocks);
  if (text === first.text || conv.apiMessages[start] !== message) return;
  conv.apiMessages[start] = { ...message, content: [{ ...first, text }, ...message.content.slice(1)] };
}

// ---------------------------------------------------------------------------------------------
// Live segments while the input streams

const EMPTY_STATS = { hologram: () => ({ parts: 0, shapes: 0 }), blueprint: () => ({ views: 0, shapes: 0, primitives: 0, callouts: 0, parts: 0, dimensions: 0, steps: 0 }) };

function newSegment(kind, { req, toolUseId }) {
  const base = { id: uid(), kind, req, toolUseId, status: 'building', title: '' };
  if (kind === 'hologram') {
    const { spec } = normalizeHologramSpec({}, { partial: true });
    return { ...base, subtitle: '', spec, stats: EMPTY_STATS.hologram(), warnings: [], libraryId: null, fromLibrary: false };
  }
  const { spec } = normalizeBlueprintSpec({}, { partial: true });
  return { ...base, subject: '', sheet: spec.sheet, spec, stats: EMPTY_STATS.blueprint(), warnings: [], libraryId: null, for: null, fromLibrary: false };
}

/** Whether a streaming tool_use block gets a live segment (version 4 conversations only). */
export function isLiveVisualTool(ctx, name) {
  return !!SPEC_TOOLS[name] && hasVisualTools(ctx.conv, name);
}

/** Creates the live segment as soon as a show_hologram / draw_blueprint block starts. */
export function startVisualSegment(ctx, block, req) {
  const seg = newSegment(SPEC_TOOLS[block.name], { req, toolUseId: block.id });
  ctx.visualSegments.set(block.id, seg);
  ctx.addSegment(seg);
  return { seg, lastAt: 0, json: '' };
}

/** Applies a normalized spec to a segment; true when anything visible changed. */
function applySpec(seg, spec, live) {
  const json = JSON.stringify(spec);
  if (live && json === live.json) return false;
  if (live) live.json = json;
  seg.spec = spec;
  seg.title = spec.title || '';
  if (seg.kind === 'hologram') {
    seg.subtitle = spec.subtitle || '';
    seg.stats = { parts: spec.parts.length, shapes: spec.parts.reduce((n, p) => n + p.shapes.length, 0) };
  } else {
    seg.subject = spec.subject || '';
    seg.sheet = spec.sheet;
    seg.stats = summarizeBlueprint(spec);
  }
  return true;
}

/**
 * Updates a live segment from the raw input streamed so far (throttled; `final` at the block's end
 * forces an update from the complete input). The throttle adapts to the work: updates are at least
 * eight times their own cost apart, so even a huge input never takes more than about 1/8 of the
 * CPU (on a phone, a large car is a few milliseconds per update).
 */
export function updateVisualSegment(ctx, live, raw, { final = false } = {}) {
  const seg = live?.seg;
  if (!seg || seg.status !== 'building') return;
  const now = Date.now();
  const interval = Math.max(ctx.liveIntervalMs ?? LIVE_INTERVAL_MS, (live.cost || 0) * 8);
  if (!final && now - live.lastAt < interval) return;
  live.lastAt = now;
  try {
    applyDraft(ctx, live, raw, final);
  } finally {
    live.cost = Date.now() - now;
  }
}

function applyDraft(ctx, live, raw, final) {
  const seg = live.seg;
  let draft;
  let complete = false;
  if (final) {
    try {
      draft = JSON.parse(raw);
      complete = true;
    } catch {
      draft = parsePartialJson(raw);
    }
  } else {
    draft = parsePartialJson(raw);
  }
  if (!isPlainObject(draft)) return;
  // A complete input needs no stable-prefix cut; a partial one does (its last value may be cut short).
  const spec = seg.kind === 'hologram'
    ? normalizeHologramSpec(draft, { partial: true, stable: !complete }).spec
    : normalizeBlueprintSpec(complete ? draft : blueprintStablePrefix(draft), { partial: true }).spec;
  if (spec && applySpec(seg, spec, live)) ctx.touchSegment(seg);
}

/** Marks a visual segment that will never finish (cut, stopped, not run) as an error. */
export function failVisualSegment(ctx, toolUseId, warning) {
  const seg = ctx.visualSegments.get(toolUseId);
  if (!seg || seg.status !== 'building') return;
  seg.status = 'error';
  if (warning) seg.warnings = [...(seg.warnings || []), warning];
  ctx.touchSegment(seg);
}

/** Removes the live segment of a tool call that was dropped from the response (e.g. after a fallback). */
export function dropVisualSegment(ctx, toolUseId) {
  const seg = ctx.visualSegments.get(toolUseId);
  if (!seg) return;
  ctx.visualSegments.delete(toolUseId);
  ctx.removeSegments((s) => s === seg);
}

/** The segment of a tool call: the live one when it streamed, else a new one (resume, open_saved). */
function segmentFor(ctx, toolUse, kind, req) {
  const existing = ctx.visualSegments.get(toolUse.id);
  if (existing && existing.kind === kind) return existing;
  const seg = newSegment(kind, { req, toolUseId: toolUse.id });
  ctx.visualSegments.set(toolUse.id, seg);
  ctx.addSegment(seg);
  return seg;
}

// ---------------------------------------------------------------------------------------------
// The tool round

/**
 * Saves a finished item. Returns 'lib_…', null when the save failed, or undefined when the app has
 * no library (the tool_result then says nothing about saving). Idempotent per segment (resume).
 */
async function saveItem(ctx, seg, record) {
  if (!ctx.deps.library || typeof ctx.deps.library.save !== 'function') return undefined;
  if (typeof seg.libraryId === 'string' && LIBRARY_ID.test(seg.libraryId)) return seg.libraryId;
  // What the item cost to make: the turn's cost not yet attributed to an earlier item of this turn.
  const cost = Math.max(0, (Number(ctx.turn.costUsd) || 0) - (ctx.libraryCostCounted || 0));
  ctx.libraryCostCounted = Number(ctx.turn.costUsd) || 0;
  const out = await callLibrary(ctx, 'save', {
    ...record,
    conversationId: ctx.conv.id,
    turnId: ctx.turn.id,
    segmentId: seg.id,
    costUsd: Math.round(cost * 1e6) / 1e6,
  });
  return isPlainObject(out) && typeof out.id === 'string' && LIBRARY_ID.test(out.id) ? out.id : null;
}

function finishSegment(ctx, seg, spec, warnings, libraryId) {
  applySpec(seg, spec, null);
  seg.warnings = warnings.slice();
  seg.libraryId = typeof libraryId === 'string' ? libraryId : null;
  seg.status = 'done';
  ctx.touchSegment(seg);
}

function failSegment(ctx, seg, warnings, spec = null) {
  if (spec) applySpec(seg, spec, null);
  seg.warnings = warnings.slice();
  seg.status = 'error';
  ctx.touchSegment(seg);
}

async function finishHologram(ctx, toolUse, req) {
  const seg = segmentFor(ctx, toolUse, 'hologram', req);
  const res = normalizeHologramSpec(toolUse.input);
  if (!res.ok || !res.spec) {
    failSegment(ctx, seg, res.warnings, res.spec && res.spec.parts.length ? res.spec : null);
    return hologramToolResult(res);
  }
  const libraryId = await saveItem(ctx, seg, {
    kind: 'hologram',
    title: res.spec.title,
    subject: res.spec.subtitle,
    spec: res.spec,
    stats: { parts: res.stats.parts, shapes: res.stats.shapes },
    parent: null,
    partName: null,
  });
  finishSegment(ctx, seg, res.spec, res.warnings, libraryId);
  return hologramToolResult(res, libraryId === undefined ? undefined : { libraryId });
}

/**
 * The saved hologram (and part) a finished blueprint belongs to: the turn's own 2D request first
 * (the owner tapped "Build 2D blueprint"), else the spec's `for` when that model exists in the
 * library and has that part. Returns { model, part, partName } or null.
 */
async function blueprintParent(ctx, spec) {
  const asked = cleanBlueprintFor(ctx.turn.blueprintFor);
  const claimed = spec.for ? cleanBlueprintFor({ model: spec.for.model, part: spec.for.part ?? null }) : null;
  const target = asked || claimed;
  if (!target) return null;
  const hologram = await loadHologram(ctx, target.model);
  const part = hologram && target.part ? hologram.parts.find((p) => p.id === target.part) : null;
  if (!asked && (!hologram || (target.part && !part))) return null; // an unverifiable claim links nothing
  return { model: target.model, part: target.part, partName: part ? part.name : null };
}

async function finishBlueprint(ctx, toolUse, req) {
  const seg = segmentFor(ctx, toolUse, 'blueprint', req);
  const res = normalizeBlueprintSpec(toolUse.input);
  if (!res.spec) {
    failSegment(ctx, seg, res.warnings);
    return blueprintToolResult(res);
  }
  const parent = await blueprintParent(ctx, res.spec);
  const spec = { ...res.spec };
  if (parent) spec.for = parent.part ? { model: parent.model, part: parent.part } : { model: parent.model };
  else delete spec.for;
  seg.for = parent ? { model: parent.model, part: parent.part } : null;
  const libraryId = await saveItem(ctx, seg, {
    kind: 'blueprint',
    title: spec.title,
    subject: spec.subject,
    spec,
    stats: summarizeBlueprint(spec),
    parent: parent ? { model: parent.model, part: parent.part } : null,
    partName: parent ? parent.partName : null,
  });
  finishSegment(ctx, seg, spec, res.warnings, libraryId);
  return blueprintToolResult(res, libraryId === undefined ? undefined : { libraryId });
}

function cut(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** The tool_result of open_saved: what opened, bounded. */
function openedSummary(kind, spec, item) {
  if (kind === 'hologram') {
    const parts = spec.parts.map((p) => `${p.id} (${oneLine(p.name, 40)})`).join(', ');
    return cut(`Opened the saved hologram "${oneLine(spec.title, 80)}" (${plural(spec.parts.length, 'part')}) on the owner's screen, at no cost. Parts (id and label): ${parts}.`, OPEN_SUMMARY_CHARS);
  }
  const c = summarizeBlueprint(spec);
  const rows = spec.sheet === 'process' && spec.steps.length
    ? `Steps: ${spec.steps.map((s) => `${s.n} ${oneLine(s.title, 60)}`).join('; ')}.`
    : spec.parts.length ? `Parts: ${spec.parts.map((p) => `${p.n} ${oneLine(p.name, 60)}`).join('; ')}.` : '';
  const counts = [sheetLabel(spec.sheet)];
  if (c.parts) counts.push(plural(c.parts, 'part'));
  if (c.steps) counts.push(plural(c.steps, 'step'));
  const parent = cleanBlueprintFor(item?.parent);
  const of = parent ? ` It is the blueprint of ${parent.part ? `part ${parent.part} of ` : ''}the hologram ${parent.model}.` : '';
  return cut(`Opened the saved blueprint "${oneLine(spec.title, 80)}" (${counts.join(', ')}) on the owner's screen, at no cost.${of} ${rows}`.trim(), OPEN_SUMMARY_CHARS);
}

async function openSaved(ctx, toolUse, req) {
  const input = isPlainObject(toolUse.input) ? toolUse.input : {};
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!LIBRARY_ID.test(id)) {
    return { content: 'Invalid open_saved input: "id" must be the id of a saved item from <turn_context>, like "lib_ab12cd34ef".', is_error: true };
  }
  if (!ctx.deps.library || typeof ctx.deps.library.get !== 'function') {
    return { content: 'The owner\'s library is not available right now. Build the item again only if the owner wants it.', is_error: true };
  }
  const item = await callLibrary(ctx, 'get', id);
  let spec = null;
  let kind = null;
  if (isPlainObject(item) && item.id === id && (item.kind === 'hologram' || item.kind === 'blueprint')) {
    kind = item.kind;
    if (kind === 'hologram') {
      const res = normalizeHologramSpec(item.spec);
      spec = res.ok ? res.spec : null;
    } else {
      spec = normalizeBlueprintSpec(item.spec).spec;
    }
  }
  if (!spec) {
    const rows = await callLibrary(ctx, 'list', { limit: 5 });
    const known = (Array.isArray(rows) ? rows : [])
      .filter((r) => isPlainObject(r) && typeof r.id === 'string' && LIBRARY_ID.test(r.id) && r.id !== id)
      .map((r) => `${r.id} (${r.kind === 'blueprint' ? 'blueprint' : 'hologram'} "${oneLine(r.title, 60).replace(/"/g, "'")}")`);
    const why = item === null || item === undefined || !isPlainObject(item) ? `No saved item has the id ${id}.` : `The saved item ${id} is damaged and cannot be opened.`;
    return { content: `${why}${known.length ? ` Saved items include: ${known.join(', ')}.` : ' The library is empty.'} Use an id from <turn_context>, or build it again if the owner wants it.`, is_error: true };
  }
  // Opened once per call: a resumed round that runs it again reuses the card it already added.
  const existing = ctx.visualSegments.get(toolUse.id);
  const seg = existing && existing.kind === kind ? existing : newSegment(kind, { req, toolUseId: toolUse.id });
  seg.fromLibrary = true;
  seg.libraryId = id;
  seg.status = 'done';
  applySpec(seg, spec, null);
  if (kind === 'blueprint') seg.for = cleanBlueprintFor(item.parent);
  if (seg === existing) ctx.touchSegment(seg);
  else {
    ctx.visualSegments.set(toolUse.id, seg);
    ctx.addSegment(seg);
  }
  return { content: openedSummary(kind, spec, item) };
}

/**
 * Runs one show_hologram / draw_blueprint / open_saved call of a tool round and returns its
 * tool_result { content, is_error? }. Never throws.
 */
export async function runVisualTool(ctx, toolUse, req) {
  try {
    if (toolUse.name === 'show_hologram') return await finishHologram(ctx, toolUse, req);
    if (toolUse.name === 'draw_blueprint') return await finishBlueprint(ctx, toolUse, req);
    return await openSaved(ctx, toolUse, req);
  } catch (err) {
    console.error(`[jarvis] ${toolUse.name} failed:`, err);
    failVisualSegment(ctx, toolUse.id, 'The app could not finish this item.');
    return { content: `The app could not finish ${toolUse.name}: ${String(err?.message || err)}`, is_error: true };
  }
}
