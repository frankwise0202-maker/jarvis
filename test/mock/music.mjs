// Apple Music in the mock (lead tools version 6): [[music]] makes Jarvis call find_music; the request
// that carries the tool_result(s) gets one or two sentences read from them, as the V5 prompt's
// "Music" section asks ("Here's Back In Black by AC/DC. Tap Open in Apple Music to play it."). Only
// when the request defines find_music (an older conversation gets a plain answer instead, as the
// real API would).
//
//   [[music]]                       find_music { query: <the owner's words>, kind: 'song', limit: 3 }
//   [[music:back in black ac/dc]]   that query
//   [[music:album:back in black]]   kind album (also artist:<name>)
//   [[music:recommend]]             two picks in one response (a rainy-Sunday recommendation):
//                                   "Riders on the Storm The Doors" (song) and "Come Away With Me
//                                   Norah Jones" (album), then a sentence naming both

import { newToolUseId, truncate } from './util.mjs';

export const MUSIC_TOOL_NAME = 'find_music';
const KINDS = ['song', 'album', 'artist'];

export const RECOMMENDATIONS = Object.freeze([
  Object.freeze({ query: 'Riders on the Storm The Doors', kind: 'song', limit: 3 }),
  Object.freeze({ query: 'Come Away With Me Norah Jones', kind: 'album', limit: 3 }),
]);

/** find_music inputs from the directive argument and the owner's words. */
export function musicInputsOf(arg, prompt = '') {
  const raw = String(arg || '').trim();
  if (raw.toLowerCase() === 'recommend') return RECOMMENDATIONS.map((x) => ({ ...x }));
  let kind = 'song';
  let query = raw;
  const m = /^(song|album|artist)\s*:\s*(.*)$/i.exec(raw);
  if (m) {
    kind = m[1].toLowerCase();
    query = m[2];
  }
  if (!query) {
    // The owner's words, without "play" and politeness: "Play Back in Black by AC/DC" -> "Back in Black AC/DC".
    query = String(prompt || '')
      .replace(/^(?:please |jarvis,? |could you |can you )*(?:play|find|put on|open|search for)\s+/i, '')
      .replace(/\s+by\s+/i, ' ')
      .replace(/[?.!]+$/, '')
      .trim();
  }
  return [{ query: truncate(query || 'Back in Black AC/DC', 120), kind: KINDS.includes(kind) ? kind : 'song', limit: 3 }];
}

/** The lead's response: a thought, a short sentence for several picks, then the find_music call(s). */
export function findMusicPlan({ think, inputs, spoken = false }) {
  const many = inputs.length > 1;
  const blocks = [think(many ? 'The owner wants music for a mood. I will pick concrete songs and albums and search Apple Music for each.' : 'The owner wants to hear a specific song. I will find it in Apple Music; the card lets them preview it or open it in the Music app.')];
  if (many) blocks.push({ type: 'text', text: spoken ? 'Let me find a couple of good ones.' : 'Here are two picks for a rainy Sunday.', citations: null });
  for (const input of inputs) blocks.push({ type: 'tool_use', id: newToolUseId(), name: MUSIC_TOOL_NAME, input });
  return { blocks, stop_reason: 'tool_use', pace: 'quick' };
}

/** "Back In Black by AC/DC" from the first line of a find_music result ("1. Song "X" by Y (…)"). */
export function firstPick(resultText) {
  const m = /^\d+\. (?:Song|Album) "([^"]+)"(?: by ([^(\n]+?))?(?: \(|$)/m.exec(String(resultText || ''));
  if (!m) return null;
  return m[2] ? `${m[1]} by ${m[2].trim()}` : m[1];
}

/** The sentence(s) after the find_music result(s), read from them like Claude would. */
export function musicFollowUpText(results, { spoken = false } = {}) {
  const list = Array.isArray(results) ? results : [];
  const failed = list.find((r) => r && r.is_error);
  if (failed && list.length === 1) return `I couldn't search Apple Music just now: ${truncate(String(failed.text || ''), 140)}`;
  const picks = list.map((r) => firstPick(r && r.text)).filter(Boolean);
  if (!picks.length) return "I couldn't find that in Apple Music. Shall I try a different spelling?";
  if (picks.length === 1) return `Here's ${picks[0]}. Tap Open in Apple Music to play it${spoken ? '' : ', or Preview to hear 30 seconds'}.`;
  return `For a rainy Sunday: ${picks.slice(0, -1).join(', ')} and ${picks[picks.length - 1]}. Tap Preview to hear a clip, or Open in Apple Music to play one.`;
}
