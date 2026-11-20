// Optics in the lead turn (lead tools version 5): the frames a conversation holds, the Optics
// lines of <turn_context>, live pins from the streamed pin_labels input, and the two client tools
// (pin_labels, look_through_camera). No DOM access here.
//
// Frames. A Look is a normal turn whose user message carries one image; startTurn({ optics })
// gives it an id ("f1", "f2", … per conversation) and stores
//   userTurn.optics = { frameId, width, height, source, capturedAt }
// (width and height are read from the JPEG itself). A look_through_camera result adds a segment
//   { id, kind: 'frame', req, toolUseId, frameId, width, height, source, reason, thumb }
// Pins (in turn.segments, updated in place while the input streams, like a live hologram):
//   { id, kind: 'pins', req, toolUseId, status: 'live'|'done'|'error', frameId, labels: [{ text, x, y }],
//     warnings: [] }
// The app's camera dependency (deps.camera, optional; each function may return a Promise):
//   isLive() -> boolean          the Optics screen (or the Voice Mode tile) has the camera on
//   source() -> 'rear'|'front'|'camera'
//   grab({ reason }) -> { data /* base64 JPEG */, thumb /* data:image/jpeg URL */, source } | null

import {
  LOOK_THROUGH_CAMERA,
  OPTICS_LIMITS,
  OPTICS_TOOLS,
  PIN_LABELS,
  cleanFrame,
  imageSizeOf,
  nextFrameId,
  normalizePinLabels,
  opticsFrameLine,
  opticsLiveLine,
  pinLabelsResult,
} from '../lib/optics.js';
import { sniffImageType } from './attachments.js';
import { abortError, isPlainObject, parsePartialJson, singleLine, truncate, uid } from './util.js';

/** The owner's words for a Look without a question (the message text Claude receives). */
export const OPTICS_DEFAULT_TEXT = 'What am I looking at?';

/** How long the engine waits for the camera to hand over a frame. */
export const CAMERA_TIMEOUT_MS = 5000;
const SAFE_THUMB = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_THUMB_CHARS = 200 * 1024;
const MAX_IMAGE_BASE64 = 5 * 1024 * 1024;

/** Whether the conversation's frozen tools include `name` (pin_labels by default: lead tools V5). */
export function hasOpticsTool(conv, name = PIN_LABELS) {
  return !!conv && Array.isArray(conv.tools) && conv.tools.some((t) => t && t.name === name);
}

export function isOpticsTool(ctx, name) {
  return OPTICS_TOOLS.includes(name) && hasOpticsTool(ctx.conv, name);
}

export function isPinsSegment(seg) {
  return !!seg && seg.kind === 'pins';
}

/** Map(frameId → { id, width, height, source, turnId }) of every Optics frame in the conversation. */
export function conversationFrames(conv) {
  const frames = new Map();
  for (const t of Array.isArray(conv?.turns) ? conv.turns : []) {
    if (!t || typeof t !== 'object') continue;
    if (t.role === 'user' && isPlainObject(t.optics)) {
      const f = cleanFrame({ id: t.optics.frameId, width: t.optics.width, height: t.optics.height, source: t.optics.source });
      if (f) frames.set(f.id, { ...f, turnId: t.id });
    } else if (t.role === 'jarvis' && Array.isArray(t.segments)) {
      for (const s of t.segments) {
        if (!s || s.kind !== 'frame') continue;
        const f = cleanFrame({ id: s.frameId, width: s.width, height: s.height, source: s.source });
        if (f) frames.set(f.id, { ...f, turnId: t.id });
      }
    }
  }
  return frames;
}

/**
 * Checks startTurn's `optics` input ({ source, capturedAt }) against its attachments (exactly one
 * image) and returns the frame record for the user turn, with the size read from the image bytes.
 * Throws TypeError on misuse (the UI never sends anything else).
 */
export function prepareOpticsFrame(conv, optics, files) {
  if (!isPlainObject(optics)) throw new TypeError('startTurn: optics must be an object');
  const images = (files || []).filter((f) => f.kind === 'image');
  if (images.length !== 1 || files.length !== 1) throw new TypeError('startTurn: an Optics turn carries exactly one image');
  const size = imageSizeOf(images[0].data);
  if (!size) throw new TypeError('startTurn: the Optics frame must be a JPEG or PNG');
  const longEdge = Math.max(size.width, size.height);
  if (longEdge > OPTICS_LIMITS.screenMaxEdge) throw new TypeError(`startTurn: Optics frames are at most ${OPTICS_LIMITS.screenMaxEdge} px on the long edge`);
  const id = nextFrameId([...conversationFrames(conv).keys()]);
  const frame = cleanFrame({ id, width: size.width, height: size.height, source: optics.source });
  if (!frame) throw new TypeError('startTurn: the Optics frame is too small');
  const at = Number(optics.capturedAt);
  return { frameId: frame.id, width: frame.width, height: frame.height, source: frame.source, capturedAt: Number.isFinite(at) && at > 0 ? Math.round(at) : null };
}

/**
 * The Optics lines for this turn's <turn_context> (added before its closing tag): the frame line
 * of a Look, and the "camera is live" line while the app's camera is on (version 5 only).
 */
export function opticsContextLines(conv, frame, deps) {
  const lines = [];
  if (frame) lines.push(opticsFrameLine({ id: frame.frameId, width: frame.width, height: frame.height, source: frame.source }, { pins: hasOpticsTool(conv, PIN_LABELS) }));
  if (hasOpticsTool(conv, LOOK_THROUGH_CAMERA) && cameraIsLive(deps)) lines.push(opticsLiveLine(cameraSource(deps)));
  return lines.filter(Boolean);
}

function cameraIsLive(deps) {
  try {
    return !!(deps?.camera && typeof deps.camera.isLive === 'function' && deps.camera.isLive() === true);
  } catch {
    return false;
  }
}

function cameraSource(deps) {
  try {
    const s = typeof deps?.camera?.source === 'function' ? deps.camera.source() : 'camera';
    return s === 'rear' || s === 'front' ? s : 'camera';
  } catch {
    return 'camera';
  }
}

// ---------------------------------------------------------------------------------------------
// Live pins while pin_labels streams

/** Whether a streaming tool_use block gets a live pins segment (version 5 conversations only). */
export function isLivePinsTool(ctx, name) {
  return name === PIN_LABELS && hasOpticsTool(ctx.conv, PIN_LABELS);
}

/** Creates the live segment as soon as a pin_labels block starts. */
export function startPinsSegment(ctx, block, req) {
  const seg = { id: uid(), kind: 'pins', req, toolUseId: block.id, status: 'live', frameId: null, labels: [], warnings: [] };
  ctx.pinsSegments.set(block.id, seg);
  ctx.addSegment(seg);
  return { seg, count: 0 };
}

/**
 * Updates a live pins segment from the input streamed so far: only complete labels are shown (the
 * last one may still be streaming), and a label never moves once shown.
 */
export function updatePinsSegment(ctx, live, raw, { final = false } = {}) {
  const seg = live?.seg;
  if (!seg || seg.status !== 'live') return;
  let draft;
  try {
    draft = final ? JSON.parse(raw) : parsePartialJson(raw);
  } catch {
    draft = parsePartialJson(raw);
  }
  if (!isPlainObject(draft)) return;
  const norm = normalizePinLabels(draft, conversationFrames(ctx.conv), { partial: !final });
  if (!norm.ok) return;
  if (norm.labels.length <= live.count && seg.frameId === norm.frame.id) return;
  seg.frameId = norm.frame.id;
  seg.labels = norm.labels.slice(0, Math.max(live.count, norm.labels.length));
  live.count = seg.labels.length;
  ctx.touchSegment(seg);
}

/** Marks a pins segment that will never finish (cut, stopped, not run) as an error. */
export function failPinsSegment(ctx, toolUseId, warning) {
  const seg = ctx.pinsSegments.get(toolUseId);
  if (!seg || seg.status !== 'live') return;
  seg.status = 'error';
  if (warning) seg.warnings = [...(seg.warnings || []), warning];
  ctx.touchSegment(seg);
}

/** Removes the live segment of a tool call that was dropped from the response. */
export function dropPinsSegment(ctx, toolUseId) {
  const seg = ctx.pinsSegments.get(toolUseId);
  if (!seg) return;
  ctx.pinsSegments.delete(toolUseId);
  ctx.removeSegments((s) => s === seg);
}

// ---------------------------------------------------------------------------------------------
// The tool round

/** pin_labels or look_through_camera: { content, is_error? } for the tool_result. Never throws. */
export async function runOpticsTool(ctx, toolUse, req) {
  try {
    if (toolUse.name === PIN_LABELS) return runPinLabels(ctx, toolUse, req);
    return await runLookThroughCamera(ctx, toolUse, req);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.error(`[jarvis] ${toolUse.name} failed:`, err);
    failPinsSegment(ctx, toolUse.id, 'The app could not show these labels.');
    return { content: 'The app could not complete this. Answer in words instead.', is_error: true };
  }
}

function runPinLabels(ctx, toolUse, req) {
  const norm = normalizePinLabels(toolUse.input, conversationFrames(ctx.conv));
  let seg = ctx.pinsSegments.get(toolUse.id);
  if (!seg) {
    // A resumed round, or a stream that never started the live segment.
    seg = { id: uid(), kind: 'pins', req, toolUseId: toolUse.id, status: 'live', frameId: null, labels: [], warnings: [] };
    ctx.pinsSegments.set(toolUse.id, seg);
    ctx.addSegment(seg);
  }
  if (norm.ok) {
    seg.status = 'done';
    seg.frameId = norm.frame.id;
    seg.labels = norm.labels;
    seg.warnings = norm.warnings;
  } else {
    seg.status = 'error';
    seg.warnings = [norm.error];
  }
  ctx.touchSegment(seg);
  return pinLabelsResult(norm);
}

/** `value`, unless `ms` pass first or `signal` aborts. */
function settleWithin(value, ms, signal) {
  let timer = null;
  let onAbort = null;
  return Promise.race([
    Promise.resolve(value),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no frame within ${ms} ms`)), ms);
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

const CAMERA_OFF = "The camera is off, so nothing was captured. Ask the owner to open Optics (the camera key) and tap Look, or to describe what they see.";

async function runLookThroughCamera(ctx, toolUse, req) {
  const camera = ctx.deps.camera;
  if (!camera || typeof camera.grab !== 'function' || !cameraIsLive(ctx.deps)) return { content: CAMERA_OFF, is_error: true };
  const reason = truncate(singleLine(typeof toolUse.input?.reason === 'string' ? toolUse.input.reason : ''), 120);
  let shot = null;
  try {
    shot = await settleWithin(camera.grab({ reason }), CAMERA_TIMEOUT_MS, ctx.signal);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    shot = null;
  }
  const data = typeof shot?.data === 'string' ? shot.data : '';
  const type = data ? sniffImageType(data) : null;
  const size = type === 'image/jpeg' || type === 'image/png' ? imageSizeOf(data) : null;
  if (!size || data.length > MAX_IMAGE_BASE64 || Math.max(size.width, size.height) > OPTICS_LIMITS.screenMaxEdge) {
    return { content: shot ? 'The camera returned no usable frame. Ask the owner to tap Look instead.' : CAMERA_OFF, is_error: true };
  }
  const frameId = nextFrameId([...conversationFrames(ctx.conv).keys()]);
  const frame = cleanFrame({ id: frameId, width: size.width, height: size.height, source: shot.source || cameraSource(ctx.deps) });
  const thumb = typeof shot.thumb === 'string' && shot.thumb.length <= MAX_THUMB_CHARS && SAFE_THUMB.test(shot.thumb) ? shot.thumb : null;
  ctx.addSegment({ id: uid(), kind: 'frame', req, toolUseId: toolUse.id, frameId: frame.id, width: frame.width, height: frame.height, source: frame.source, reason, thumb });
  return {
    content: [
      { type: 'text', text: opticsFrameLine(frame, { pins: hasOpticsTool(ctx.conv, PIN_LABELS) }) },
      { type: 'image', source: { type: 'base64', media_type: type, data } },
    ],
  };
}

/**
 * The single line text exports (share, Markdown, copy) use for an Optics segment, e.g.
 * '[Optics f3: AA battery · Coffee mug · Pothos]'. '' for any other segment.
 */
export function opticsExportLine(segment) {
  if (!segment) return '';
  if (segment.kind === 'pins' && segment.status === 'done' && Array.isArray(segment.labels) && segment.labels.length) {
    const names = segment.labels.map((l) => String(l.text || '').replace(/[[\]]/g, '')).filter(Boolean).slice(0, OPTICS_LIMITS.maxLabels);
    return `[Optics ${segment.frameId || ''}: ${names.join(' · ')}]`.replace(' :', ':');
  }
  if (segment.kind === 'frame') return `[Optics ${segment.frameId || ''}: Jarvis looked through the camera]`;
  return '';
}
