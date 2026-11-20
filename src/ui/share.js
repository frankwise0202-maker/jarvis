// Records (SPEC 14.4): Markdown builders for sharing an answer, a mission dossier or a whole
// conversation, plus the share / copy / download helpers that deliver them.
//
// The builders are pure functions over the SPEC 6 data model: they never touch the DOM, never
// mutate their input and tolerate missing or malformed fields, so they run unchanged in the
// browser, a worker or `node --test`. Everything that came from the model, the web or the owner
// is treated as untrusted text: link targets must be absolute http(s) URLs, link text is
// escaped, and no HTML is ever produced.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { fmtDuration, fmtUsd, hostname } from './hud/format.js';
import { MODELS, DEPTHS, MODES } from '../engine/models.js';
import { isVisualSegment, visualExportLine } from '../engine/visuals.js';
import { describeItem, musicExportItem } from '../lib/music.js';

// ---------------------------------------------------------------------------------------------
// Small, defensive accessors

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const oneLine = (v) => str(v).replace(/\s+/g, ' ').trim();
const sum = (list, fn) => list.reduce((acc, item) => acc + fn(item), 0);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const PER_AGENT_SOURCES = 12; // matches the per-agent cap in the mission tool_result (SPEC 8.4)
const ACTIVE_AGENT = new Set(['starting', 'thinking', 'searching', 'reading', 'writing']);

const AGENT_STATUS = {
  queued: 'Not started',
  starting: 'Starting',
  thinking: 'Thinking',
  searching: 'Searching',
  reading: 'Reading',
  writing: 'Writing',
  done: 'Done',
  error: 'Failed',
  stopped: 'Stopped',
  interrupted: 'Interrupted',
};
const MISSION_STATUS = {
  planning: 'Planning',
  running: 'In progress',
  done: 'Complete',
  partial: 'Partial',
  stopped: 'Stopped',
  interrupted: 'Interrupted',
};
const TURN_STATUS = {
  running: 'In progress',
  done: 'Complete',
  stopped: 'Stopped by the owner',
  error: 'Ended with an error',
  interrupted: 'Interrupted before finishing',
};

// ---------------------------------------------------------------------------------------------
// Markdown safety

/** Escape characters that would change the meaning of inline Markdown (one line). */
export function escapeInline(value) {
  return oneLine(value).replace(/[\\`*_[\]<>|~]/g, '\\$&');
}

// Exported files are opened in Markdown viewers we don't control, and some of them render raw
// HTML. Text from the model, agents, web pages or the owner is therefore made inert in every
// export (safeMarkdown): "<" that could open a tag, comment or autolink becomes "&lt;", and links
// or reference definitions whose target isn't http(s), mailto or a #fragment lose their link
// syntax. Fenced code blocks at column 0 are kept as written so code stays readable, but only
// when every fence-like line of the document sits at column 0: an indented or quoted fence may
// belong to a list item or quote that ends before the fence does, and a viewer would then read
// the following lines as Markdown while we took them for code. In that case nothing is exempt.
// (Inline code is not exempt either: link destinations, table cells and spans that cross lines
// decide where a code span ends, so "<" is escaped there too.)

const FENCE_OPEN_RE = /^(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const FENCE_LIKE_RE = /^([\s>*+\-\d.)]*)(`{3,}|~{3,})/;
const SAFE_TARGET_RE = /^(?:https?:\/\/|mailto:|#)/i;
const TAG_START_RE = /[A-Za-z!/?]/;

/** The opening fence of a column-0 fenced code block ("```js", "~~~~"), or null. */
function fenceOpen(line) {
  const m = FENCE_OPEN_RE.exec(line);
  if (!m || (m[1][0] === '`' && m[2].includes('`'))) return null; // backtick fences: no backticks in the info string
  return { fence: m[1], info: m[2] };
}

const closesFence = (line, fence) => {
  const m = FENCE_CLOSE_RE.exec(line);
  return !!m && m[1][0] === fence[0] && m[1].length >= fence.length;
};

/**
 * Close a column-0 fenced code block left open at the end of `md` (a stopped or truncated
 * reply), so an embedded field can never turn the rest of an export into code.
 */
export function closeFences(md) {
  const text = str(md);
  let fence = null;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
    } else {
      const open = fenceOpen(line);
      if (open) fence = open.fence;
    }
  }
  return fence ? `${text.replace(/\s+$/, '')}\n${fence}` : text;
}

/** One line of Markdown outside code: escape tag openers, unlink unsafe targets. */
function neutralizeLine(line) {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') {
      // "\<b>" is safe in CommonMark but not in older Markdown dialects: use the entity.
      if (line[i + 1] === '<' && TAG_START_RE.test(line[i + 2] || '')) {
        out += '&lt;';
        i += 1;
      } else {
        out += c + (line[i + 1] ?? '');
        i += 1;
      }
      continue;
    }
    if (c === '<' && TAG_START_RE.test(line[i + 1] || '')) {
      out += '&lt;';
      continue;
    }
    if (c === ']' && (line[i + 1] === '(' || line[i + 1] === ':')) {
      const target = line.slice(i + 2).replace(/^[ \t]+/, '');
      const footnote = line[i + 1] === ':' && /\[\^[^\]]*$/.test(out);
      if (!SAFE_TARGET_RE.test(target) && !footnote) {
        // "]\(" is no link, "\]:" no reference definition: the text stays, the target goes inert.
        out += line[i + 1] === '(' ? ']\\(' : '\\]:';
        i += 1;
        continue;
      }
    }
    out += c;
  }
  return out;
}

/**
 * Markdown that is inert in any viewer (see the note above). Idempotent: running it twice
 * changes nothing more.
 */
export function safeMarkdown(md) {
  const lines = str(md).replace(/\r\n?/g, '\n').split('\n');
  const keepCode = lines.every((line) => {
    const m = FENCE_LIKE_RE.exec(line);
    return !m || m[1] === '';
  });
  let fence = null;
  return lines
    .map((line) => {
      if (keepCode) {
        if (fence) {
          if (closesFence(line, fence)) fence = null;
          return line;
        }
        const open = fenceOpen(line);
        if (open) {
          fence = open.fence;
          return open.fence + neutralizeLine(open.info);
        }
      }
      return neutralizeLine(line);
    })
    .join('\n');
}

// An API key the owner pasted into a chat must never leave in an export (the backup leaves
// such conversations out; shared and downloaded text gets the key replaced instead).

/**
 * Anthropic API keys, also after a Markdown escaper put a backslash before an underscore, and
 * with a capitalized prefix ("Sk-ant-…" at the start of a sentence still holds the secret).
 */
const API_KEY_RE = /sk-ant-(?:\\?[A-Za-z0-9_-]){20,}/gi;
export const REDACTED_KEY = '[API key removed]';

/** True when `text` contains something shaped like an Anthropic API key. */
export function containsApiKey(text) {
  return typeof text === 'string' && /sk-ant-[A-Za-z0-9_-]{20,}/i.test(text);
}

/**
 * `text` with the saved key (`knownKey`, also in its Markdown-escaped form) and anything else
 * shaped like an Anthropic API key replaced by "[API key removed]".
 */
export function redactSecrets(text, knownKey) {
  let out = str(text);
  if (!out) return out;
  const key = typeof knownKey === 'string' ? knownKey.trim() : '';
  if (key.length >= 8) {
    for (const variant of new Set([key, key.replace(/[\\`*_[\]<>|~]/g, '\\$&')])) {
      if (out.includes(variant)) out = out.split(variant).join(REDACTED_KEY);
    }
  }
  return out.replace(API_KEY_RE, REDACTED_KEY);
}

/** Last step of every export: inert Markdown, no secrets. */
function finishExport(md, opts) {
  return redactSecrets(safeMarkdown(md), isObj(opts) ? opts.apiKey : '');
}

/** Tidy display form of a model-written role: trimmed, first letter capitalized, no shouting. */
function roleLabel(role) {
  let s = oneLine(role);
  if (s.length > 4 && s === s.toUpperCase() && s !== s.toLowerCase()) s = s.toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Absolute http(s) URL ready for a Markdown link destination, or null. */
function linkTarget(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  // The URL parser leaves parentheses alone; they would end the link destination early.
  return parsed.href.replace(/[()<>\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/** "[Title](https://…)" for a safe URL; plain escaped text otherwise. */
function mdLink(label, url) {
  const target = linkTarget(url);
  const text = escapeInline(label) || escapeInline(hostname(url)) || escapeInline(url) || 'link';
  return target ? `[${text}](${target})` : text;
}

/** Quote every line of a block ("> …"). */
function quoteBlock(text) {
  return str(text)
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');
}

/** Normalize line endings and trim blank lines at both ends (keeps indentation). */
function tidy(md) {
  return str(md).replace(/\r\n?/g, '\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^( {0,3})(#{1,6})(?=[ \t]|$)(.*)$/;

/**
 * Shift ATX headings so the shallowest heading in `md` lands at `minLevel` (outside code
 * fences). Headings pushed past level 6 become bold paragraphs. Never promotes headings.
 */
export function demoteHeadings(md, minLevel) {
  const lines = tidy(md).split('\n');
  let fence = null;
  let shallowest = 7;
  const kinds = lines.map((line) => {
    const f = FENCE_RE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = null;
      return 'code';
    }
    if (f) {
      fence = f[1];
      return 'code';
    }
    const m = HEADING_RE.exec(line);
    if (m) {
      shallowest = Math.min(shallowest, m[2].length);
      return 'heading';
    }
    return 'text';
  });
  const shift = shallowest === 7 ? 0 : Math.max(0, minLevel - shallowest);
  if (!shift) return lines.join('\n');
  return lines
    .map((line, i) => {
      if (kinds[i] !== 'heading') return line;
      const m = HEADING_RE.exec(line);
      const level = m[2].length + shift;
      const rest = m[3].replace(/[ \t]+#+[ \t]*$/, '').trim();
      if (level <= 6) return `${'#'.repeat(level)}${rest ? ` ${rest}` : ''}`;
      return rest ? `**${rest}**` : '';
    })
    .join('\n');
}

// ---------------------------------------------------------------------------------------------
// Sources

/** Dedupe key for a URL: host without "www." + path without trailing slash + query minus utm_*. */
export function sourceKey(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const params = Array.from(u.searchParams.keys());
    for (const k of params) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.host.replace(/^www\./i, '')}${path}${u.search}`;
  } catch {
    return null;
  }
}

/** URLs linked (Markdown links, autolinks or bare) inside a Markdown text, as dedupe keys. */
function linkedKeys(md) {
  const keys = new Set();
  const text = str(md);
  const patterns = [
    /\]\(\s*<?(https?:\/\/[^\s()<>]*(?:\([^\s()<>]*\)[^\s()<>]*)*)>?/gi, // [t](url) incl. balanced parens
    /<(https?:\/\/[^\s<>]+)>/gi, // <https://…>
    /(?:^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]])/gi, // bare URLs
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      const key = sourceKey(m[1]);
      if (key) keys.add(key);
    }
  }
  return keys;
}

const GENERIC_LINK_TEXT = /^(?:source|sources|src|link|here|this|page|article|ref|\[?\d+\]?)$/i;

/** [text](url) links in Markdown as sources; generic link text ("source", "[1]") is dropped as a title. */
function markdownLinks(md) {
  const out = [];
  const re = /\[([^\]\n]*)\]\(\s*<?(https?:\/\/[^\s()<>]*(?:\([^\s()<>]*\)[^\s()<>]*)*)>?(?:\s+"[^"\n]*")?\s*\)/gi;
  let m;
  while ((m = re.exec(str(md)))) {
    const text = oneLine(m[1].replace(/[*_`]/g, ''));
    out.push({ url: m[2], title: text.length > 3 && !GENERIC_LINK_TEXT.test(text) ? text : '' });
  }
  return out;
}

/** Ordered, deduplicated source registry. */
function createSourceList() {
  const map = new Map();
  return {
    add(src, by) {
      if (!isObj(src)) return;
      const key = sourceKey(src.url);
      if (!key) return;
      let entry = map.get(key);
      if (!entry) {
        entry = { key, url: src.url.trim(), title: oneLine(src.title), by: [] };
        map.set(key, entry);
      } else if (!entry.title && oneLine(src.title)) {
        entry.title = oneLine(src.title);
      }
      if (by && !entry.by.includes(by)) entry.by.push(by);
    },
    /** Add only when the URL is new (links in prose: they do not change who found a page). */
    addMissing(src, by) {
      const key = isObj(src) ? sourceKey(src.url) : null;
      if (key && !map.has(key)) this.add(src, by);
    },
    list: () => Array.from(map.values()),
    get size() {
      return map.size;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Turn / mission / agent inspection (shared with stats.js)

/** Missions of a turn in display order (mission segments), then wave, then creation time. */
export function missionsOf(turn) {
  const missions = isObj(turn) && isObj(turn.missions) ? Object.values(turn.missions).filter(isObj) : [];
  const order = new Map();
  arr(turn && turn.segments).forEach((s, i) => {
    if (isObj(s) && s.kind === 'mission' && s.missionId != null && !order.has(s.missionId)) order.set(s.missionId, i);
  });
  const big = Number.MAX_SAFE_INTEGER;
  return missions
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        (order.has(a.m.id) ? order.get(a.m.id) : big) - (order.has(b.m.id) ? order.get(b.m.id) : big) ||
        (num(a.m.wave) || big) - (num(b.m.wave) || big) ||
        num(a.m.createdAt) - num(b.m.createdAt) ||
        a.i - b.i,
    )
    .map((x) => x.m);
}

/** Agents of a mission (objects only). */
const agentsOf = (mission) => arr(mission && mission.agents).filter(isObj);

/** True for an agent that actually started work (queued/planned agents never ran). */
export function isDeployed(agent) {
  if (!isObj(agent)) return false;
  return num(agent.startedAt) > 0 || num(agent.attempts) > 0 || agent.status === 'done' || agent.status === 'error' || ACTIVE_AGENT.has(agent.status);
}

const agentSearches = (a) => Math.max(arr(a.searches).length, num(isObj(a.usage) ? a.usage.searches : 0));
const agentFetches = (a) => Math.max(arr(a.fetches).length, num(isObj(a.usage) ? a.usage.fetches : 0));

function textSegments(turn) {
  return arr(turn && turn.segments).filter((s) => isObj(s) && s.kind === 'text');
}

/** Every source a turn touched: lead citations and tool results, then agent sources. */
function turnSources(turn, missions) {
  const list = createSourceList();
  for (const seg of arr(turn && turn.segments)) {
    if (!isObj(seg)) continue;
    if (seg.kind === 'text') for (const src of arr(seg.citations)) list.add(src, 'Jarvis');
    if (seg.kind === 'tool') for (const src of arr(seg.results)) list.add(src, 'Jarvis');
  }
  for (const mission of missions) {
    for (const agent of agentsOf(mission)) for (const src of arr(agent.sources)) list.add(src, oneLine(agent.codename) || 'Agent');
  }
  return list;
}

/**
 * Numbers that describe a finished (or running) turn. Each count is the larger of what the
 * engine reported in `turn.stats` / `turn.usage` and what can be counted from the turn's
 * missions and segments, so a turn with missing fields still adds up.
 */
export function turnMetrics(turn) {
  const t = isObj(turn) ? turn : {};
  const st = isObj(t.stats) ? t.stats : {};
  const usage = isObj(t.usage) ? t.usage : {};
  const missions = missionsOf(t);
  const deployed = missions.flatMap(agentsOf).filter(isDeployed);
  const tools = arr(t.segments).filter((s) => isObj(s) && s.kind === 'tool');
  // A mission counts once it started (like the engine's `waves`); a deploy_agents call that was
  // refused (quick mode, wave limit) never starts. Its agents, in order, give the roles: that
  // list only ever grows, even when a resumed turn starts agents that were queued before.
  const launched = missions.filter((m) => num(m.startedAt) > 0 || agentsOf(m).some(isDeployed));
  const duration = num(t.endedAt) && num(t.createdAt) ? Math.max(0, t.endedAt - t.createdAt) : 0;
  return {
    agents: Math.max(num(st.agents), deployed.length),
    agentsOk: deployed.filter((a) => a.status === 'done').length,
    agentsFailed: deployed.filter((a) => a.status === 'error').length,
    missions: missions.length ? launched.length : num(st.waves),
    searches: Math.max(num(st.searches), num(usage.searches), tools.filter((s) => s.tool === 'web_search').length + sum(deployed, agentSearches)),
    fetches: Math.max(num(usage.fetches), tools.filter((s) => s.tool === 'web_fetch').length + sum(deployed, agentFetches)),
    sources: Math.max(num(st.sources), turnSources(t, missions).size),
    costUsd: Math.max(num(t.costUsd), sum(deployed, (a) => num(a.costUsd))),
    durationMs: num(st.durationMs) || duration,
    roles: launched
      .flatMap(agentsOf)
      .map((a) => (typeof a.role === 'string' ? oneLine(a.role) : ''))
      .filter(Boolean),
  };
}

/**
 * The turn footer stats line: "8 agents · 23 searches · 41 sources · 1m 12s · ≈ $0.42"
 * (prefixed with "Stopped" for stopped turns unless opts.status is false).
 */
export function turnStatsLine(turn, opts = {}) {
  if (!isObj(turn)) return '';
  const m = turnMetrics(turn);
  const parts = [];
  if (turn.status === 'stopped' && !(isObj(opts) && opts.status === false)) parts.push('Stopped');
  if (m.agents) parts.push(plural(m.agents, 'agent'));
  if (m.searches) parts.push(plural(m.searches, 'search', 'searches'));
  if (m.sources) parts.push(plural(m.sources, 'source'));
  if (m.durationMs >= 1000) parts.push(fmtDuration(m.durationMs));
  parts.push(fmtUsd(m.costUsd));
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------------------------
// Dates and labels

const MAX_DATE_MS = 8.64e15; // the last moment a JavaScript Date can hold

function fmtWhen(ms, opts, style) {
  const t = num(ms);
  if (!t || t > MAX_DATE_MS) return ''; // a damaged record's timestamp must not break the export
  const fields =
    style === 'time'
      ? { hour: '2-digit', minute: '2-digit' }
      : style === 'stamp'
        ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        : style === 'date'
          ? { day: 'numeric', month: 'short', year: 'numeric' }
          : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
  const o = opts || {};
  try {
    return new Intl.DateTimeFormat(o.locale || undefined, o.timeZone ? { ...fields, timeZone: o.timeZone } : fields).format(new Date(t));
  } catch {
    try {
      return new Intl.DateTimeFormat(undefined, fields).format(new Date(t));
    } catch {
      return new Date(t).toISOString();
    }
  }
}

function dayOf(ms, opts) {
  return fmtWhen(ms, opts, 'date');
}

const modelLabel = (id) => (typeof id === 'string' && id ? (MODELS[id] && MODELS[id].label) || id : '');

function modeLine(turn) {
  const parts = [];
  const mode = MODES[turn.mode];
  if (mode) parts.push(mode);
  const depth = DEPTHS[turn.depth];
  if (depth) parts.push(`${depth.label} depth`);
  return parts.join(' · ');
}

function modelsLine(turn, agents) {
  const lead = modelLabel(turn.leadModel);
  const workerIds = Array.from(new Set(agents.map((a) => (typeof a.model === 'string' && a.model) || '').filter(Boolean)));
  if (!workerIds.length && agents.length && turn.workerModel) workerIds.push(turn.workerModel);
  const parts = [];
  if (lead) parts.push(`${escapeInline(lead)} (lead)`);
  if (workerIds.length) parts.push(`${workerIds.map((id) => escapeInline(modelLabel(id))).join(', ')} (agents)`);
  return parts.join(' · ');
}

/** First line of a request, cut at a word boundary: a readable document title. */
function shortTitle(text, max = 80) {
  const line = oneLine(text);
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** The UserTurn that asked for this Jarvis turn (the closest user turn before it). */
function questionFor(turn, opts) {
  if (opts && typeof opts.question === 'string' && opts.question.trim()) return opts.question.trim();
  const conv = opts && isObj(opts.conversation) ? opts.conversation : null;
  if (!conv || !isObj(turn)) return '';
  const turns = arr(conv.turns);
  const idx = turns.findIndex((t) => isObj(t) && t.id === turn.id);
  for (let i = (idx === -1 ? turns.length : idx) - 1; i >= 0; i--) {
    const t = turns[i];
    if (isObj(t) && t.role === 'user') return str(t.text).trim();
  }
  return '';
}

// ---------------------------------------------------------------------------------------------
// Answer

/**
 * Join text segments into Markdown. Consecutive text segments of the same lead request are
 * concatenated directly (the API splits cited text into several blocks mid-sentence); groups
 * separated by other segments or requests become separate paragraphs.
 */
function joinText(segments) {
  const groups = [];
  let current = null;
  let prevReq;
  for (const seg of segments) {
    if (!isObj(seg)) continue;
    if (isVisualSegment(seg)) {
      // A hologram or blueprint: one line ("[Hologram: … · 43 parts]"), never its spec.
      const line = visualExportLine(seg);
      if (line) groups.push(escapeInline(line));
      current = null;
      continue;
    }
    if (seg.kind === 'music') {
      // A Music card: its song or album as a link ("Apple Music: Back In Black by AC/DC").
      const item = musicExportItem(seg);
      if (item) groups.push(mdLink(`Apple Music: ${describeItem(item)}`, item.url));
      current = null;
      continue;
    }
    if (seg.kind !== 'text') {
      current = null;
      continue;
    }
    const piece = str(seg.text);
    if (current !== null && seg.req === prevReq) {
      groups[groups.length - 1] += piece;
    } else {
      groups.push(piece);
      current = groups.length - 1;
    }
    prevReq = seg.req;
  }
  return groups
    .map((g) => tidy(g))
    .filter((g) => g.trim())
    .join('\n\n');
}

/** The answer text exactly as the model wrote it (see answerMarkdown), for analysis and embedding. */
function answerSource(turn) {
  const segments = arr(isObj(turn) ? turn.segments : null);
  let lastMission = -1;
  segments.forEach((s, i) => {
    if (isObj(s) && s.kind === 'mission') lastMission = i;
  });
  const md = lastMission >= 0 ? joinText(segments.slice(lastMission + 1)) : '';
  return md || joinText(segments);
}

/**
 * The final answer of a Jarvis turn as Markdown (its text segments joined). When the turn
 * deployed agents, only the text written after the last mission counts (the synthesis), so the
 * "I'm sending four agents…" preamble is left out; if nothing was written after it, all text is
 * used. Options: `{ sources: true }` appends a "Sources" list of cited pages that the text does
 * not already link to; `apiKey` is the saved key, removed wherever it appears (anything else
 * shaped like an API key is removed too). The result is safe Markdown (see safeMarkdown).
 */
export function answerMarkdown(turn, opts = {}) {
  const o = isObj(opts) ? opts : {};
  const source = answerSource(turn);
  if (!source) return '';
  let md = closeFences(source);
  if (o.sources) {
    const linked = linkedKeys(source);
    const cited = createSourceList();
    for (const seg of textSegments(turn)) for (const src of arr(seg.citations)) cited.add(src);
    const extra = cited.list().filter((s) => !linked.has(s.key));
    if (extra.length) {
      const hasList = /^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?(?:sources|references)(?:\*\*|__)?:?\s*$/im.test(source);
      md = `${md}\n\n**${hasList ? 'More sources' : 'Sources'}**\n\n${extra.map((s) => `- ${mdLink(s.title, s.url)}`).join('\n')}`;
    }
  }
  return finishExport(md, o);
}

// ---------------------------------------------------------------------------------------------
// Mission dossier

function agentSection(agent, index, headingLevel) {
  const lines = [];
  const codename = oneLine(agent.codename) || `Agent ${index + 1}`;
  const role = roleLabel(agent.role);
  lines.push(`${'#'.repeat(headingLevel)} ${escapeInline(codename)}${role ? ` · ${escapeInline(role)}` : ''}`, '');

  const status = AGENT_STATUS[agent.status] || (oneLine(agent.status) ? escapeInline(agent.status) : 'Unknown');
  const statusBits = [status];
  const elapsed = num(agent.startedAt) && num(agent.endedAt) ? Math.max(0, agent.endedAt - agent.startedAt) : 0;
  if (elapsed >= 1000) statusBits.push(fmtDuration(elapsed));
  if (num(agent.costUsd)) statusBits.push(fmtUsd(agent.costUsd));
  let statusLine = `- **Status:** ${statusBits.join(' · ')}`;
  const errMsg = isObj(agent.error) ? oneLine(agent.error.message) : '';
  if (agent.status === 'error' && errMsg) statusLine += ` — ${escapeInline(errMsg)}`;
  lines.push(statusLine);
  const searches = agentSearches(agent);
  const fetches = agentFetches(agent);
  const sources = createSourceList();
  for (const src of arr(agent.sources)) sources.add(src);
  if (agent.web === false) lines.push('- **Research:** no web access (reasoning only)');
  else lines.push(`- **Research:** ${plural(searches, 'search', 'searches')} · ${plural(fetches, 'page')} read · ${plural(sources.size, 'source')}`);
  if (num(agent.attempts) > 1) lines.push(`- **Attempts:** ${agent.attempts}`);
  lines.push('');

  const task = str(agent.task).trim();
  if (task) lines.push('**Task**', '', quoteBlock(closeFences(task)), '');

  const queries = arr(agent.searches).map(oneLine).filter(Boolean);
  if (queries.length) lines.push(`**Search log:** ${queries.map((q) => `“${escapeInline(q)}”`).join(' · ')}`, '');

  const report = tidy(agent.report);
  if (report.trim()) {
    const partial = agent.status !== 'done' ? ' (partial)' : '';
    lines.push(`**Report${partial}**`, '', demoteHeadings(closeFences(report), Math.min(6, headingLevel + 1)), '');
  } else {
    const why = {
      error: 'No report: the agent failed before writing one.',
      stopped: 'No report: the agent was stopped before finishing.',
      interrupted: 'No report: the connection dropped before the agent finished.',
      queued: 'No report: the agent never started.',
    }[agent.status];
    lines.push(`*${why || 'No report yet.'}*`, '');
  }

  const list = sources.list();
  if (list.length) {
    lines.push('**Sources**', '');
    list.slice(0, PER_AGENT_SOURCES).forEach((s, i) => {
      const host = hostname(s.url);
      lines.push(`${i + 1}. ${mdLink(s.title || host, s.url)}${host ? ` — ${escapeInline(host)}` : ''}`);
    });
    if (list.length > PER_AGENT_SOURCES) {
      const more = list.length - PER_AGENT_SOURCES;
      lines.push('', `*…and ${plural(more, 'more source')} in the master list below.*`);
    }
    lines.push('');
  }
  return lines;
}

function missionTotals(missions) {
  const agents = missions.flatMap(agentsOf);
  const deployed = agents.filter(isDeployed);
  const sources = createSourceList();
  for (const a of agents) for (const s of arr(a.sources)) sources.add(s);
  const starts = missions.map((m) => num(m.startedAt)).concat(deployed.map((a) => num(a.startedAt))).filter(Boolean);
  const ends = missions.map((m) => num(m.endedAt)).concat(deployed.map((a) => num(a.endedAt))).filter(Boolean);
  return {
    agents,
    deployed,
    searches: sum(deployed, agentSearches),
    fetches: sum(deployed, agentFetches),
    sources: sources.size,
    costUsd: sum(agents, (a) => num(a.costUsd)),
    durationMs: starts.length && ends.length ? Math.max(0, Math.max(...ends) - Math.min(...starts)) : 0,
  };
}

function breakdown(agents) {
  const counts = {};
  for (const a of agents) {
    const key = a.status === 'error' ? 'failed' : a.status === 'done' ? 'done' : a.status === 'stopped' ? 'stopped' : a.status === 'interrupted' ? 'interrupted' : ACTIVE_AGENT.has(a.status) ? 'working' : 'not started';
    counts[key] = (counts[key] || 0) + 1;
  }
  return ['done', 'failed', 'stopped', 'interrupted', 'working', 'not started'].filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`).join(', ');
}

/**
 * A complete, shareable dossier for one mission (wave) of a turn, or for every mission of the
 * turn when `mission` is omitted / null. `mission` may be a Mission object or a mission id.
 * Options: { conversation, question, apiKey, now, locale, timeZone }. `conversation` (or
 * `question`) lets the dossier quote the owner's request; `apiKey` as in answerMarkdown. The
 * result is safe Markdown (see safeMarkdown).
 */
export function missionReportMarkdown(turn, mission, opts = {}) {
  const t = isObj(turn) ? turn : {};
  const o = isObj(opts) ? opts : {};
  const all = missionsOf(t);
  let scope = all;
  let single = null;
  if (isObj(mission)) single = all.find((m) => m.id === mission.id) || mission;
  else if (typeof mission === 'string' && mission) single = all.find((m) => m.id === mission) || null;
  if (single) scope = [single];

  const question = questionFor(t, o);
  const answer = answerSource(t);
  const metrics = turnMetrics(t);
  const totals = missionTotals(scope);
  // Title: the mission's own title (wave 1 summarizes a multi-wave request best); for a turn
  // without agents, the request itself.
  const titleText =
    (single && oneLine(single.title)) ||
    scope.map((m) => oneLine(m.title)).find(Boolean) ||
    shortTitle(question) ||
    (isObj(o.conversation) && oneLine(o.conversation.title)) ||
    'Untitled request';
  const kind = scope.length ? 'Mission dossier' : 'Jarvis briefing';

  // Master source list (computed first so the header count matches it).
  const master = createSourceList();
  if (!single) {
    for (const seg of arr(t.segments)) {
      if (!isObj(seg)) continue;
      if (seg.kind === 'text') for (const src of arr(seg.citations)) master.add(src, 'Jarvis');
      if (seg.kind === 'tool') for (const src of arr(seg.results)) master.add(src, 'Jarvis');
    }
  }
  for (const m of scope) for (const a of agentsOf(m)) for (const src of arr(a.sources)) master.add(src, oneLine(a.codename) || 'Agent');
  // Pages linked only in prose (the answer or an agent's report) belong in the list too.
  if (!single) for (const src of markdownLinks(answer)) master.addMissing(src, 'Jarvis');
  for (const m of scope) for (const a of agentsOf(m)) for (const src of markdownLinks(a.report)) master.addMissing(src, oneLine(a.codename) || 'Agent');
  const entries = master.list();

  const out = [`# ${kind}: ${escapeInline(titleText)}`, ''];
  if (question && titleText !== oneLine(question)) out.push(quoteBlock(userBlock(closeFences(question))), '');

  // Header
  const header = [];
  const requested = fmtWhen(t.createdAt || (single && single.createdAt), o, 'full');
  if (requested) header.push(`- **Requested:** ${requested}`);
  if (single) {
    const waveNo = num(single.wave) || all.indexOf(single) + 1 || 1;
    header.push(`- **Wave:** ${waveNo} of ${Math.max(all.length, waveNo)}`);
  }
  const statusParts = [];
  if (single) statusParts.push(MISSION_STATUS[single.status] || TURN_STATUS[t.status] || 'Unknown');
  else statusParts.push(TURN_STATUS[t.status] || (scope.length ? 'Complete' : 'Unknown'));
  if (totals.agents.length) statusParts.push(`${totals.agents.filter((a) => a.status === 'done').length} of ${plural(totals.agents.length, 'agent')} reported back`);
  header.push(`- **Status:** ${statusParts.join(' · ')}`);
  const mode = modeLine(t);
  if (mode) header.push(`- **Mode:** ${mode}`);
  const models = modelsLine(t, totals.deployed);
  if (models) header.push(`- **Models:** ${models}`);
  if (totals.agents.length) {
    const waves = scope.length > 1 ? ` across ${scope.length} waves` : '';
    header.push(`- **Agents:** ${totals.deployed.length || totals.agents.length} deployed${waves} — ${breakdown(totals.agents)}`);
  }
  const searches = single ? totals.searches : Math.max(metrics.searches, totals.searches);
  const fetches = single ? totals.fetches : Math.max(metrics.fetches, totals.fetches);
  const sourceCount = entries.length;
  if (searches || fetches || sourceCount) {
    header.push(`- **Research:** ${plural(searches, 'search', 'searches')} · ${plural(fetches, 'page')} read · ${plural(sourceCount, 'unique source')}`);
  }
  const duration = single ? totals.durationMs : metrics.durationMs || totals.durationMs;
  if (duration >= 1000) header.push(`- **Duration:** ${fmtDuration(duration)}`);
  if (single && (totals.costUsd || metrics.costUsd)) {
    const whole = metrics.costUsd;
    header.push(`- **Estimated cost:** ${fmtUsd(totals.costUsd)} for this wave's agents${whole > totals.costUsd ? ` · ${fmtUsd(whole)} for the whole request` : ''}`);
  } else if (!single && (metrics.costUsd || totals.costUsd)) {
    header.push(`- **Estimated cost:** ${fmtUsd(Math.max(metrics.costUsd, totals.costUsd))}${totals.deployed.length ? ' (lead and agents)' : ''}`);
  }
  out.push(...header, '');

  // Final answer
  out.push('## Final answer', '');
  if (answer) out.push(demoteHeadings(closeFences(answer), 3), '');
  else out.push(`*${t.status === 'running' ? 'Jarvis was still working when this report was exported.' : 'No final answer was written for this request.'}*`, '');

  if (t.status === 'error' && isObj(t.error) && oneLine(t.error.message)) out.push(`> **Error:** ${escapeInline(t.error.message)}`, '');

  // Field reports
  if (scope.length) {
    out.push('## Field reports', '');
    const multi = scope.length > 1;
    let n = 0;
    for (const m of scope) {
      if (multi) {
        const wave = num(m.wave) || all.indexOf(m) + 1;
        const title = oneLine(m.title);
        out.push(`### Wave ${wave}${title ? `: ${escapeInline(title)}` : ''}`, '');
        const status = MISSION_STATUS[m.status];
        const agents = agentsOf(m);
        if (status || agents.length) out.push(`*${[status, agents.length ? `${plural(agents.length, 'agent')} — ${breakdown(agents)}` : ''].filter(Boolean).join(' · ')}*`, '');
      }
      const agents = agentsOf(m);
      if (!agents.length) out.push('*No agents were assigned to this mission.*', '');
      for (const agent of agents) out.push(...agentSection(agent, n++, multi ? 4 : 3));
    }
  } else {
    out.push('## Field reports', '', '*Jarvis answered this one directly; no agents were deployed.*', '');
  }

  // Master source list: cited in the answer first, then everything else that was gathered.
  const cited = linkedKeys(answer);
  for (const seg of textSegments(t)) for (const src of arr(seg.citations)) {
    const key = sourceKey(src && src.url);
    if (key) cited.add(key);
  }
  if (entries.length) {
    const used = entries.filter((s) => cited.has(s.key));
    const rest = entries.filter((s) => !cited.has(s.key));
    out.push(`## Sources (${entries.length})`, '');
    const item = (s, i) => {
      const host = hostname(s.url);
      const meta = [host ? escapeInline(host) : '', s.by.length ? `via ${s.by.map(escapeInline).join(', ')}` : ''].filter(Boolean).join(' · ');
      return `${i + 1}. ${mdLink(s.title || host, s.url)}${meta ? ` — ${meta}` : ''}`;
    };
    if (used.length && rest.length) {
      out.push(`### Cited in the answer (${used.length})`, '', ...used.map(item), '', `### Also consulted (${rest.length})`, '', ...rest.map(item), '');
    } else {
      out.push(...entries.map(item), '');
    }
  }

  out.push('---', '', `*Exported from Jarvis on ${fmtWhen(num(o.now) || Date.now(), o, 'full')}. Costs are estimates from token counts. Agent reports summarize web pages; check important facts at the sources.*`);
  return finishExport(`${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, o);
}

// ---------------------------------------------------------------------------------------------
// Conversation transcript

function toolLine(tools) {
  const queries = [];
  const pages = [];
  for (const s of tools) {
    if (s.tool === 'web_search' && oneLine(s.query)) queries.push(`“${escapeInline(s.query)}”`);
    else if (s.tool === 'web_fetch' && s.url) pages.push(escapeInline(hostname(s.url) || s.url));
  }
  const parts = [];
  if (queries.length) parts.push(`Searched the web: ${queries.join(', ')}`);
  if (pages.length) parts.push(`Read: ${pages.join(', ')}`);
  return parts.length ? `*${parts.join(' · ')}*` : '';
}

function missionLine(mission) {
  if (!isObj(mission)) return '';
  const agents = agentsOf(mission);
  const wave = num(mission.wave);
  const head = `**Mission${wave ? ` · wave ${wave}` : ''}${oneLine(mission.title) ? `: ${escapeInline(mission.title)}` : ''}**`;
  const status = MISSION_STATUS[mission.status];
  const roster = agents
    .map((a) => {
      const name = escapeInline(a.codename) || 'Agent';
      return roleLabel(a.role) ? `${name} (${escapeInline(roleLabel(a.role))})` : name;
    })
    .join(' · ');
  const summary = [status, agents.length ? `${plural(agents.length, 'agent')} — ${breakdown(agents)}` : ''].filter(Boolean).join(' · ');
  return quoteBlock([`${head}${summary ? ` — ${summary}` : ''}`, roster].filter(Boolean).join('\n'));
}

function jarvisBody(turn) {
  const out = [];
  const segments = arr(turn.segments);
  let textRun = [];
  let toolRun = [];
  const flushText = () => {
    const md = joinText(textRun);
    if (md) out.push(demoteHeadings(closeFences(md), 3));
    textRun = [];
  };
  const flushTools = () => {
    const line = toolLine(toolRun);
    if (line) out.push(line);
    toolRun = [];
  };
  for (const seg of segments) {
    if (!isObj(seg)) continue;
    if (seg.kind === 'text') {
      flushTools();
      textRun.push(seg);
      continue;
    }
    if (seg.kind === 'thinking') continue;
    if (seg.kind === 'tool') {
      flushText();
      toolRun.push(seg);
      continue;
    }
    flushText();
    flushTools();
    if (seg.kind === 'mission') {
      const line = missionLine(isObj(turn.missions) ? turn.missions[seg.missionId] : null);
      if (line) out.push(line);
    } else if (seg.kind === 'memory' && oneLine(seg.fact)) {
      out.push(`*${seg.action === 'remove' ? 'Forgot' : 'Remembered'}: “${escapeInline(seg.fact)}”*`);
    } else if (seg.kind === 'notice' && oneLine(seg.text)) {
      out.push(`> Note: ${escapeInline(seg.text)}`);
    } else if (seg.kind === 'error' && isObj(seg.error) && oneLine(seg.error.message)) {
      out.push(`> **Error:** ${escapeInline(seg.error.message)}`);
    }
  }
  flushText();
  flushTools();
  const hasErrorSeg = segments.some((s) => isObj(s) && s.kind === 'error');
  if (turn.status === 'error' && !hasErrorSeg && isObj(turn.error) && oneLine(turn.error.message)) out.push(`> **Error:** ${escapeInline(turn.error.message)}`);
  if (turn.status === 'stopped') out.push('*Stopped by the owner.*');
  else if (turn.status === 'interrupted') out.push('*Interrupted before finishing (the connection dropped).*');
  else if (turn.status === 'running') out.push('*Still in progress when this transcript was exported.*');
  if (!out.length) out.push('*No reply.*');
  return out;
}

/** Plain user text as Markdown that cannot turn into headings or rules by accident. */
function userBlock(text) {
  return str(text)
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .map((line) => line.replace(/^(\s{0,3})(#{1,6}(?=\s|$)|[-*_](?:\s*[-*_]){2,}\s*$|=+\s*$)/, '$1\\$2'))
    .join('\n');
}

/**
 * The whole conversation as a Markdown transcript: every exchange with the owner's words,
 * Jarvis's replies (searches, missions, memory and errors as compact lines; thinking omitted)
 * and per-turn stats. Options: { apiKey, now, locale, timeZone } (`apiKey` as in
 * answerMarkdown). The result is safe Markdown (see safeMarkdown).
 */
export function conversationMarkdown(conversation, opts = {}) {
  const c = isObj(conversation) ? conversation : {};
  const o = isObj(opts) ? opts : {};
  const turns = arr(c.turns).filter(isObj);
  const firstUser = turns.find((t) => t.role === 'user');
  const title = oneLine(c.title) || (firstUser && oneLine(firstUser.text).slice(0, 60)) || 'Jarvis conversation';
  const jarvisTurns = turns.filter((t) => t.role === 'jarvis');
  const exchanges = turns.filter((t) => t.role === 'user').length;

  const out = [`# ${escapeInline(title)}`, ''];
  const metaParts = ['Jarvis conversation'];
  const started = fmtWhen(c.createdAt || (turns[0] && turns[0].createdAt), o, 'full');
  if (started) metaParts.push(`started ${started}`);
  metaParts.push(plural(exchanges, 'exchange'));
  out.push(`*${metaParts.join(' · ')}*`, '');

  const metrics = jarvisTurns.map(turnMetrics);
  const agents = sum(metrics, (m) => m.agents);
  const searches = sum(metrics, (m) => m.searches);
  const cost = sum(metrics, (m) => m.costUsd);
  const totalParts = [];
  if (agents) totalParts.push(plural(agents, 'agent'));
  if (searches) totalParts.push(plural(searches, 'search', 'searches'));
  if (cost) totalParts.push(`${fmtUsd(cost)} estimated`);
  if (totalParts.length) out.push(`*Totals: ${totalParts.join(' · ')}*`, '');

  let lastDay = '';
  let count = 0;
  for (const turn of turns) {
    const day = dayOf(turn.createdAt, o);
    const when = day && day === lastDay ? fmtWhen(turn.createdAt, o, 'time') : fmtWhen(turn.createdAt, o, 'stamp');
    if (day) lastDay = day;
    if (turn.role === 'user') {
      if (count++) out.push('---', '');
      out.push(`## You${when ? ` · ${when}` : ''}`, '', userBlock(closeFences(turn.text)) || '*(empty message)*', '');
    } else if (turn.role === 'jarvis') {
      const tags = [when, turn.mode && turn.mode !== 'auto' ? MODES[turn.mode] : ''].filter(Boolean).join(' · ');
      out.push(`## Jarvis${tags ? ` · ${tags}` : ''}`, '');
      for (const block of jarvisBody(turn)) out.push(block, '');
      if (turn.status !== 'running') {
        const line = turnStatsLine(turn, { status: false });
        if (line) out.push(`*${line}*`, '');
      }
    }
  }
  if (!turns.length) out.push('*This conversation is empty.*', '');
  out.push('---', '', `*Exported from Jarvis on ${fmtWhen(num(o.now) || Date.now(), o, 'full')}. Costs are estimates.*`);
  return finishExport(`${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, o);
}

// ---------------------------------------------------------------------------------------------
// File names

/**
 * "jarvis-mission-ev-battery-breakthroughs-2026-11-19.md". `kind` is a short word such as
 * 'answer', 'mission' or 'conversation'.
 */
export function reportFilename(kind, title, date = new Date(), ext = 'md') {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(num(date) || Date.now());
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const slugify = (s) =>
    str(s)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  let slug = slugify(title).slice(0, 48).replace(/-+$/, '');
  if (!slug) slug = 'untitled';
  const k = slugify(kind) || 'report';
  const e = slugify(ext) || 'md';
  return `jarvis-${k}-${slug}-${ymd}.${e}`;
}

function safeFilename(name) {
  let s = oneLine(name).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '-').replace(/^\.+/, '');
  if (s.length > 120) s = s.slice(0, 120);
  return s || 'jarvis-export.md';
}

// ---------------------------------------------------------------------------------------------
// Delivery: share, copy, download

/** True when the device has a native share sheet (Web Share API). */
export function canShareNatively() {
  const nav = globalThis.navigator;
  return !!nav && typeof nav.share === 'function';
}

/** Copy text to the clipboard. Resolves true on success; never throws. */
export async function copyText(text) {
  const value = str(text);
  const nav = globalThis.navigator;
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(value);
      return true;
    } catch {
      /* permission denied or insecure context: try the legacy path */
    }
  }
  return legacyCopy(value);
}

/** execCommand('copy') through an off-screen textarea (insecure origins, older WebViews). */
function legacyCopy(value) {
  const doc = globalThis.document;
  if (!doc || !doc.body || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') return false;
  const area = doc.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.tabIndex = -1;
  Object.assign(area.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0', fontSize: '16px' });
  const active = doc.activeElement;
  doc.body.appendChild(area);
  let ok = false;
  try {
    area.select();
    area.setSelectionRange(0, value.length);
    ok = doc.execCommand('copy') === true;
  } catch {
    ok = false;
  }
  area.remove();
  try {
    if (active && typeof active.focus === 'function') active.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
  return ok;
}

/**
 * Share text through the native share sheet when the device has one, else copy it.
 * Returns 'shared' | 'copied' | 'failed'. Dismissing the share sheet (AbortError) returns
 * 'failed' quietly: nothing was shared, but nothing went wrong either, so callers should not
 * show an error for 'failed' when canShareNatively() is true. Any other share error (for
 * example an expired user gesture) falls back to the clipboard.
 */
export async function shareText({ title = '', text = '' } = {}) {
  const nav = globalThis.navigator;
  const data = { title: oneLine(title), text: str(text) };
  if (!data.title) delete data.title;
  if (nav && typeof nav.share === 'function') {
    let shareable = true;
    try {
      if (typeof nav.canShare === 'function') shareable = nav.canShare(data) !== false;
    } catch {
      shareable = false;
    }
    if (shareable) {
      try {
        await nav.share(data);
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'failed';
      }
    }
  }
  return (await copyText(data.text)) ? 'copied' : 'failed';
}

/**
 * Save text as a file through a temporary object URL and <a download>. Returns true when the
 * download was started. The object URL is revoked shortly after the click (revoking it
 * synchronously can cancel the download in Safari and Firefox).
 */
export function downloadText(filename, text, mime = 'text/markdown') {
  const doc = globalThis.document;
  const URLApi = globalThis.URL;
  if (!doc || !doc.body || typeof globalThis.Blob !== 'function' || !URLApi || typeof URLApi.createObjectURL !== 'function') return false;
  let url = '';
  try {
    const type = /charset=/i.test(mime) ? mime : `${mime || 'text/plain'};charset=utf-8`;
    url = URLApi.createObjectURL(new Blob([str(text)], { type }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = safeFilename(filename);
    a.rel = 'noopener';
    a.style.display = 'none';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  } finally {
    if (url) setTimeout(() => URLApi.revokeObjectURL(url), 4000);
  }
}

// ---------------------------------------------------------------------------------------------
// "Share & export" options (UI): mount `el` in a bottom sheet. Styles: src/styles/stats.css (rec-).

/** First paragraph of an answer as plain text, for the preview line. */
function summaryLine(md) {
  const para = tidy(md).split(/\n\s*\n/).find((b) => b.trim() && !/^\s{0,3}(#|```|~~~|\||>|[-*+] |\d+[.)] )/.test(b)) || '';
  return oneLine(
    para
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .replace(/<(https?:[^>]+)>/g, '$1'),
  );
}

/**
 * createShareOptions({ turn, conversation, mission, apiKey, onDone, toast }) → { el, destroy() }
 * Rows: share (or copy) the answer; share (or copy) the mission dossier; download the dossier
 * as .md; download the conversation transcript as .md. Rows that do not apply are left out.
 * Each row confirms inline ("Copied", "Saved", "Shared"), then calls onDone(action, result) so
 * the host can close its sheet. A dismissed share sheet is not an error and changes nothing.
 * `mission` (object or id) picks the wave for the dossier; omitted = every wave of the turn.
 * `apiKey` is the saved API key: it never appears in anything shared, copied or saved here
 * (titles and file names included), nor does anything else shaped like an API key.
 * `toast(message, { level })` is optional and only used for failures.
 */
export function createShareOptions(opts = {}) {
  const o = isObj(opts) ? opts : {};
  const turn = isObj(o.turn) ? o.turn : {};
  const conv = isObj(o.conversation) ? o.conversation : null;
  const apiKey = typeof o.apiKey === 'string' ? o.apiKey : '';
  const clean = (text) => oneLine(redactSecrets(text, apiKey));
  const native = canShareNatively();
  const timers = new Set();
  let busy = false;
  let destroyed = false;

  const question = questionFor(turn, { conversation: conv });
  const title = (conv && clean(conv.title)) || shortTitle(clean(question), 60) || 'Jarvis';
  const answer = answerMarkdown(turn, { sources: true, apiKey });
  const missions = missionsOf(turn).filter((m) => agentsOf(m).length);
  const metrics = turnMetrics(turn);
  const scopeMission = isObj(o.mission) || (typeof o.mission === 'string' && o.mission) ? o.mission : null;
  const dossierTitle = (isObj(scopeMission) && clean(scopeMission.title)) || (missions[0] && clean(missions[0].title)) || title;
  const exchanges = conv ? arr(conv.turns).filter((t) => isObj(t) && t.role === 'user').length : 0;

  const metaParts = [fmtWhen(turn.createdAt, {}, 'stamp')];
  if (metrics.agents) metaParts.push(plural(metrics.agents, 'agent'));
  if (metrics.sources) metaParts.push(plural(metrics.sources, 'source'));
  const live = h('p', { class: 'rec-sr', attrs: { role: 'status', 'aria-live': 'polite' } });
  // The preview is page text (never HTML): it shows the answer as written, minus any key.
  const summary = summaryLine(redactSecrets(answerSource(turn), apiKey));
  const preview = h(
    'div',
    { class: 'rec-preview' },
    h('p', { class: 'rec-preview-title', text: title }),
    summary ? h('p', { class: 'rec-preview-text', text: summary }) : null,
    h('p', { class: 'rec-preview-meta', text: metaParts.filter(Boolean).map((p) => p.replace(/ /g, '\u00a0')).join(' · ') }),
  );

  const dossier = () => missionReportMarkdown(turn, scopeMission, { conversation: conv, apiKey });
  const actions = [];
  if (answer) {
    actions.push({
      key: 'answer',
      icon: native ? 'share' : 'copy',
      label: native ? 'Share answer' : 'Copy answer',
      desc: native ? 'Send it to Messages, Mail, Notes…' : 'Markdown with sources, ready to paste',
      run: () => shareText({ title, text: answer }),
    });
  }
  if (missions.length) {
    actions.push({
      key: 'dossier',
      icon: native ? 'share' : 'copy',
      label: native ? 'Share mission dossier' : 'Copy mission dossier',
      desc: 'Every agent’s task, report and sources',
      run: () => (native ? shareText({ title: `Mission dossier: ${dossierTitle}`, text: dossier() }) : copyText(dossier()).then((ok) => (ok ? 'copied' : 'failed'))),
    });
    const agentCount = missions.reduce((acc, m) => acc + agentsOf(m).filter(isDeployed).length, 0);
    actions.push({
      key: 'dossier-download',
      icon: 'download',
      label: 'Download dossier',
      desc: `${plural(agentCount, 'agent')}${missions.length > 1 ? ` · ${missions.length} waves` : ''} · Markdown file`,
      run: () => (downloadText(reportFilename('mission', dossierTitle, new Date(num(turn.createdAt) || Date.now())), dossier()) ? 'saved' : 'failed'),
    });
  }
  if (conv && arr(conv.turns).length) {
    actions.push({
      key: 'conversation-download',
      icon: 'layers',
      label: 'Download conversation',
      desc: `${plural(exchanges, 'exchange')} · full transcript · Markdown file`,
      run: () => (downloadText(reportFilename('conversation', title, new Date(num(conv.createdAt) || Date.now())), conversationMarkdown(conv, { apiKey })) ? 'saved' : 'failed'),
    });
  }

  const DONE = { shared: 'Shared', copied: 'Copied', saved: 'Saved' };
  const rows = actions.map((a) => {
    const state = h('span', { class: 'rec-option-state' }, icon('chevron-right', { size: 18 }));
    const btn = h(
      'button',
      { class: 'rec-option', type: 'button', attrs: { 'data-testid': 'share-option', 'data-action': a.key }, on: { click: () => trigger(a, btn, state) } },
      h('span', { class: 'rec-option-icon', attrs: { 'aria-hidden': 'true' } }, icon(a.icon, { size: 20 })),
      h('span', { class: 'rec-option-text' }, h('span', { class: 'rec-option-title', text: a.label }), h('span', { class: 'rec-option-desc', text: a.desc })),
      state,
    );
    return btn;
  });

  async function trigger(action, btn, state) {
    if (busy || destroyed) return;
    busy = true;
    el.setAttribute('aria-busy', 'true');
    let result = 'failed';
    try {
      result = await action.run();
    } catch (err) {
      console.warn('[jarvis] share action failed:', err);
      result = 'failed';
    }
    busy = false;
    el.removeAttribute('aria-busy');
    if (destroyed) return;
    const label = DONE[result];
    if (!label) {
      // A dismissed native share sheet needs no message; a failed copy or download does.
      if (!(native && (action.key === 'answer' || action.key === 'dossier'))) {
        flash(btn, state, 'is-error', 'Failed', 'alert');
        setText(live, `${action.label} failed`);
        if (typeof o.toast === 'function') o.toast(action.key.endsWith('download') ? 'Couldn’t save the file.' : 'Couldn’t copy. Try Download instead.', { level: 'warn' });
      }
      return;
    }
    flash(btn, state, 'is-done', label, 'check');
    setText(live, `${action.label}: ${label.toLowerCase()}`);
    if (typeof o.onDone === 'function') {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!destroyed) o.onDone(action.key, result);
      }, 900);
      timers.add(t);
    }
  }

  function flash(btn, state, cls, text, iconName) {
    btn.classList.remove('is-done', 'is-error');
    btn.classList.add(cls);
    state.replaceChildren(h('span', { class: 'rec-option-state-text', text }), icon(iconName, { size: 16 }));
    const t = setTimeout(() => {
      timers.delete(t);
      btn.classList.remove(cls);
      state.replaceChildren(icon('chevron-right', { size: 18 }));
    }, 2400);
    timers.add(t);
  }

  const list = h('div', { class: 'rec-options', attrs: { role: 'group', 'aria-label': 'Share and export' } }, rows);
  const empty = rows.length ? null : h('p', { class: 'rec-empty', text: 'Nothing to share yet: this reply has no text.' });
  const el = h('div', { class: 'rec-share', attrs: { 'data-testid': 'share-options' } }, preview, list, empty, live);

  return {
    el,
    destroy() {
      destroyed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
