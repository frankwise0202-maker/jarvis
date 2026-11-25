// Home base (v7.5, SPEC §23): "How's the home base?" typed or said in the chat is answered by the
// Jarvis Core's own status assistant (POST api/ask on the owner's Alienware, free: no Claude
// request). This module records that exchange in a conversation. No DOM and no network here.

import { isPlainObject, uid } from './util.js';

const clean = (value, max) => {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/**
 * Append a local home base exchange to a conversation: the owner's words and the home base's
 * answer (one text segment; `line` may be filled in once the answer is back). apiMessages is never
 * touched, so the next request Jarvis sends is exactly what it would have been without it. The
 * reply is marked `local: 'homebase'` (no model, no cost). The caller persists the conversation.
 *   -> { userTurn, turn, textSegment }
 */
export function appendHomeBaseTurn(conv, { text, line = '', spoken = false, mode = 'auto', now } = {}) {
  if (!isPlainObject(conv) || !Array.isArray(conv.turns) || !Array.isArray(conv.apiMessages)) throw new TypeError('appendHomeBaseTurn: not a conversation');
  const body = clean(text, 2000);
  if (!body) throw new TypeError('appendHomeBaseTurn: text is required');
  const ts = Number.isFinite(now) ? now : Date.now();
  const turnMode = ['auto', 'quick', 'swarm'].includes(mode) ? mode : 'auto';
  const userTurn = { id: uid(), role: 'user', text: body, mode: turnMode, createdAt: ts };
  const textSegment = { id: uid(), kind: 'text', text: clean(line, 1200), req: 0, citations: [] };
  const turn = {
    id: uid(),
    role: 'jarvis',
    createdAt: ts,
    endedAt: ts,
    status: 'done',
    local: 'homebase',
    mode: turnMode,
    leadModel: 'local',
    workerModel: 'local',
    depth: 'balanced',
    segments: [textSegment],
    missions: {},
    usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 },
    costUsd: 0,
    stats: { agents: 0, searches: 0, sources: 0, waves: 0, durationMs: 0 },
    error: null,
  };
  if (spoken === true) turn.spoken = true;
  if (!conv.title) conv.title = clean(body, 60);
  conv.turns.push(userTurn, turn);
  conv.updatedAt = ts;
  return { userTurn, turn, textSegment };
}
