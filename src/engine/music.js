// Apple Music in the lead turn: the find_music client tool (free, no account). Jarvis searches
// Apple Music's catalog on the owner's device and the app shows each result as a Music card
// (artwork, a 30-second preview, Open in Apple Music). This module validates the input, asks the
// app to search (deps.music.search), records a `music` segment for the card, and words the
// tool_result. No DOM and no network here.
//
// Lead tools are frozen per conversation, so find_music ships in lead tools version 6 (new
// conversations), with the system prompt version 5 ("# Music"):
//   leadToolsV6() = [...leadToolsV5(), findMusicTool()]
//   LEAD_SYSTEM_V5 = LEAD_SYSTEM_V4 + "# Music", before "# Writing the answer"
// lead.js runs it only when the conversation's frozen tools include it (an older conversation
// answers a stray call with "Unknown tool").
//
// The app's dependency (deps.music; may return a value or a Promise):
//   search({ query, kind, limit }, { signal }) -> { ok: true, items: [MusicItem], kind, country, artist? }
//                                               | { ok: false, error, message }
//
// Segment: { id, kind: 'music', req, toolUseId, status: 'done' | 'error', query, searchKind,
//            items: [MusicItem], artist, error: string|null, local?: true }

import { MAX_QUERY_CHARS, MUSIC_KINDS, cleanMusicItems, cleanQuery, cleanText, musicToolResult } from '../lib/music.js';
import { abortError, isPlainObject, uid } from './util.js';

export const MUSIC_TOOL = 'find_music';
export const MUSIC_TOOL_TIMEOUT_MS = 12000;
export const DEFAULT_MUSIC_LIMIT = 3;
export const MAX_MUSIC_LIMIT = 5;

export const FIND_MUSIC_DESCRIPTION = `Search Apple Music's catalog for a song, an album or an artist's top songs. It is free and runs on the owner's device; each search is shown to the owner as a Music card with the artwork, a 30-second Preview they can play in Jarvis, and an Open in Apple Music button that plays the full track in the Music app. Use it whenever the owner wants to hear something, asks you to play music, or wants recommendations: choose concrete songs or albums yourself and search for each one by title and artist (one call per pick, up to five). You cannot play full songs or control playback. Apple Music playlists cannot be searched: search for songs or albums instead. The result lists what was found, best match first.`;

/** The find_music tool definition (a fresh copy). Part of leadToolsV6: never edit it. */
export function findMusicTool() {
  return {
    name: MUSIC_TOOL,
    description: FIND_MUSIC_DESCRIPTION,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for: the title and the artist, e.g. "Back in Black AC/DC" (max 120 characters).' },
        kind: { type: 'string', enum: [...MUSIC_KINDS], description: '"song" (default), "album", or "artist" for that artist\'s top songs.' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_MUSIC_LIMIT, description: 'How many results the card offers (default 3).' },
      },
      required: ['query'],
    },
  };
}

const KIND_ALIASES = { track: 'song', songs: 'song', single: 'song', record: 'album', albums: 'album', lp: 'album', ep: 'album', band: 'artist', singer: 'artist', musician: 'artist', artists: 'artist' };

/** Validate find_music input. -> { ok: true, value: { query, kind, limit } } | { ok: false, error } */
export function validateFindMusicInput(input) {
  if (!isPlainObject(input)) return { ok: false, error: 'Invalid find_music input: it must be an object with "query".' };
  if (typeof input.query !== 'string' || !cleanQuery(input.query)) return { ok: false, error: 'Invalid find_music input: "query" must be the title and artist to search for.' };
  if (input.query.length > MAX_QUERY_CHARS * 2) return { ok: false, error: `Invalid find_music input: "query" is too long (max ${MAX_QUERY_CHARS} characters).` };
  const rawKind = typeof input.kind === 'string' ? input.kind.trim().toLowerCase() : '';
  const kind = !rawKind ? 'song' : MUSIC_KINDS.includes(rawKind) ? rawKind : KIND_ALIASES[rawKind];
  if (!kind) return { ok: false, error: `Invalid find_music input: "kind" must be one of ${MUSIC_KINDS.join(', ')}.` };
  let limit = DEFAULT_MUSIC_LIMIT;
  if (input.limit !== undefined && input.limit !== null) {
    const n = Number(input.limit);
    if (!Number.isInteger(n) || n < 1 || n > 10) return { ok: false, error: `Invalid find_music input: "limit" must be a whole number from 1 to ${MAX_MUSIC_LIMIT}.` };
    limit = Math.min(n, MAX_MUSIC_LIMIT);
  }
  return { ok: true, value: { query: cleanQuery(input.query), kind, limit } };
}

/** A music segment for an outcome (also used by the app for local "play X" turns). */
export function musicSegment(outcome, { query, kind, req = 0, toolUseId = null, local = false } = {}) {
  const o = isPlainObject(outcome) ? outcome : {};
  const seg = {
    id: uid(),
    kind: 'music',
    req,
    toolUseId,
    status: o.ok ? 'done' : 'error',
    query: cleanQuery(query || o.query || ''),
    searchKind: ['song', 'album', 'artist', 'playlist'].includes(o.kind) ? o.kind : ['song', 'album', 'artist', 'playlist'].includes(kind) ? kind : 'song',
    items: o.ok ? cleanMusicItems(o.items) : [],
    artist: cleanText(o.artist, 120),
    error: o.ok ? null : cleanText(o.error, 40) || 'network',
  };
  if (local) seg.local = true;
  return seg;
}

/** The app's answer, null after `ms`, or an AbortError as soon as `signal` aborts (Stop). */
function withTimeout(promise, ms, signal) {
  let timer;
  let onAbort = null;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => resolve(null), ms);
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

/**
 * Run one find_music call of a tool round: the search, a `music` segment (the card) and the
 * tool_result { content, is_error? }. Never throws, except an AbortError when the owner stops the
 * turn meanwhile. ctx: the lead turn context (deps, signal, addSegment).
 */
export async function runFindMusic(ctx, toolUse, req) {
  const check = validateFindMusicInput(toolUse && toolUse.input);
  if (!check.ok) return { content: check.error, is_error: true };
  const music = ctx && ctx.deps && ctx.deps.music;
  if (!music || typeof music.search !== 'function') return { content: 'Apple Music search is not available on this device right now.', is_error: true };
  const signal = (ctx && ctx.signal) || null;
  if (signal && signal.aborted) throw abortError();
  let outcome;
  try {
    outcome = await withTimeout(Promise.resolve().then(() => music.search({ ...check.value }, { signal })), ctx.musicTimeoutMs ?? MUSIC_TOOL_TIMEOUT_MS, signal);
  } catch (err) {
    if (err && err.name === 'AbortError' && signal && signal.aborted) throw err;
    outcome = { ok: false, error: 'network', message: String((err && err.message) || err) };
  }
  if (signal && signal.aborted) throw abortError();
  if (!outcome) outcome = { ok: false, error: 'timeout', message: 'Apple Music did not answer in time.' };
  const seg = musicSegment(outcome, { query: check.value.query, kind: check.value.kind, req, toolUseId: toolUse.id });
  ctx.addSegment(seg);
  return musicToolResult(outcome.ok ? { ...outcome, items: seg.items } : outcome, check.value);
}

/** Whether a segment is a Music card. */
export function isMusicSegment(segment) {
  return !!segment && segment.kind === 'music';
}

/**
 * Append a local "play X" exchange to a conversation (free: no Claude request): the owner's words
 * and Jarvis's reply, a line of text and the Music card. apiMessages is never touched, so the next
 * request Jarvis sends is exactly what it would have been without it. The reply is marked
 * `local: 'music'` (no model, no cost). The caller persists the conversation.
 *   -> { userTurn, turn, segment, textSegment }
 */
export function appendMusicTurn(conv, { text, line, segment, spoken = false, mode = 'auto', now } = {}) {
  if (!conv || typeof conv !== 'object' || !Array.isArray(conv.turns) || !Array.isArray(conv.apiMessages)) throw new TypeError('appendMusicTurn: not a conversation');
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) throw new TypeError('appendMusicTurn: text is required');
  if (!isMusicSegment(segment)) throw new TypeError('appendMusicTurn: a music segment is required');
  const ts = Number.isFinite(now) ? now : Date.now();
  const turnMode = ['auto', 'quick', 'swarm'].includes(mode) ? mode : 'auto';
  const userTurn = { id: uid(), role: 'user', text: body, mode: turnMode, createdAt: ts };
  // The line comes first (it may be filled in once the search is back: "Here's …").
  const textSegment = { id: uid(), kind: 'text', text: cleanText(line, 400), req: 0, citations: [] };
  segment.local = true;
  const segments = [textSegment, segment];
  const turn = {
    id: uid(),
    role: 'jarvis',
    createdAt: ts,
    endedAt: ts,
    status: 'done',
    local: 'music',
    mode: turnMode,
    leadModel: 'local',
    workerModel: 'local',
    depth: 'balanced',
    segments,
    missions: {},
    usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 },
    costUsd: 0,
    stats: { agents: 0, searches: 0, sources: 0, waves: 0, durationMs: 0 },
    error: null,
  };
  if (spoken === true) turn.spoken = true;
  if (!conv.title) conv.title = cleanText(body, 60);
  conv.turns.push(userTurn, turn);
  conv.updatedAt = ts;
  return { userTurn, turn, segment, textSegment };
}
