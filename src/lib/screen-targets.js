// Screens (v7): what "this" is, and the other things a screen can show. Pure: it reads the open
// viewer's description and the conversation (turns and segments), never the DOM.
//
//   resolveScreenTarget({ what, ordinal, open, conv, url, id })
//     -> { kind, ref, title, live } | { error, message }
//   kinds: 'hologram' | 'blueprint' | 'mission' | 'answer' | 'photo' | 'camera' | 'link'
//   ref:   hologram/blueprint { libraryId, segmentId, conversationId, turnId }
//          mission { conversationId, turnId, missionId }
//          answer  { conversationId, turnId, report }
//          photo   { src, title, credit }      (https://upload.wikimedia.org/… or a data: thumbnail)
//          link    { url, title }
//          camera  {}
//
// "this" = the open viewer (hologram, blueprint, photo, camera, Mission Control sheet), else what was
// just put on a screen when nothing newer has come since ("float it", then "now put it on my other
// screen"), else the newest card in the chat: in the newest reply, a hologram or blueprint card
// first, then a mission that is still running, then the answer (a research report once its mission
// is done); a photo the owner sent counts when it is newer than every reply.
//
//   answerMarkdownOf(turn)  the reply's final answer (the text after its last search, mission or
//                           visual), like Voice Mode's finalAnswerMarkdown
//   linksOf(markdown)       [{ url, title }] in order, http(s) only, no duplicates
//   screenKindLabel(kind, { report })  'HOLOGRAM', 'MISSION CONTROL', 'REPORT', …

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v : '');
const turnsOf = (conv) => (conv && Array.isArray(conv.turns) ? conv.turns.filter(isObj) : []);
const segmentsOf = (turn) => (turn && Array.isArray(turn.segments) ? turn.segments.filter(isObj) : []);
const ACTIONS = new Set(['tool', 'mission', 'hologram', 'blueprint']);
const LIBRARY_ID = /^lib_[a-z0-9]{6,16}$/;

export const SCREEN_KINDS = Object.freeze(['hologram', 'blueprint', 'mission', 'answer', 'photo', 'camera', 'link', 'look']);

export function screenKindLabel(kind, { report = false } = {}) {
  switch (kind) {
    case 'hologram':
      return 'HOLOGRAM';
    case 'blueprint':
      return 'BLUEPRINT';
    case 'mission':
      return 'MISSION CONTROL';
    case 'answer':
      return report ? 'REPORT' : 'ANSWER';
    case 'photo':
      return 'PHOTO';
    case 'camera':
      return 'OPTICS';
    case 'link':
      return 'LINK';
    case 'look':
      return 'LOOK';
    case 'jarvis':
      return 'JARVIS';
    default:
      return 'SCREEN';
  }
}

/** Spoken/written name of a kind: 'the hologram', 'Mission Control', 'the report'. */
export function screenKindName(kind, { report = false } = {}) {
  switch (kind) {
    case 'mission':
      return 'Mission Control';
    case 'answer':
      return report ? 'the report' : 'the answer';
    case 'camera':
      return 'the camera';
    case 'look':
      return 'the Look';
    case 'jarvis':
      return 'Jarvis';
    default:
      return `the ${kind || 'screen'}`;
  }
}

function reqOf(seg) {
  return Number.isFinite(seg && seg.req) ? seg.req : 0;
}

export function answerMarkdownOf(turn) {
  const segs = segmentsOf(turn);
  const isText = (s) => s.kind === 'text' && typeof s.text === 'string' && s.text.trim() !== '';
  let cutAt = -1;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    if (ACTIONS.has(segs[i].kind)) {
      cutAt = i;
      break;
    }
  }
  let tail = segs.slice(cutAt + 1).filter(isText);
  if (!tail.length) {
    const texts = segs.filter(isText);
    if (!texts.length) return '';
    const lastReq = Math.max(...texts.map(reqOf));
    tail = texts.filter((s) => reqOf(s) === lastReq);
  }
  let out = '';
  let prev = null;
  for (const s of tail) {
    if (prev !== null && reqOf(s) !== prev) out += '\n\n';
    out += s.text;
    prev = reqOf(s);
  }
  return out.trim();
}

/** Every text of a reply (for links): the whole answer, not only its last part. */
function allTextOf(turn) {
  return segmentsOf(turn)
    .filter((s) => s.kind === 'text' && typeof s.text === 'string')
    .map((s) => s.text)
    .join('\n\n');
}

function cleanUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/[).,;:!?\]'"]+$/, '');
  if (!/^https?:\/\//i.test(s) || s.length > 2048) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Links in Markdown: [title](url), <url> and bare http(s) URLs, in order, without duplicates. */
export function linksOf(markdown) {
  const md = txt(markdown);
  const out = [];
  const seen = new Set();
  const add = (url, title) => {
    const href = cleanUrl(url);
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push({ url: href, title: txt(title).replace(/\s+/g, ' ').trim().slice(0, 140) || hostOf(href) });
  };
  const re = /\[([^\]\n]{0,200})\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)|<(https?:\/\/[^\s>]+)>|(https?:\/\/[^\s<>()\]]+)/gi;
  let m;
  while ((m = re.exec(md))) {
    if (m[2]) add(m[2], m[1]);
    else if (m[3]) add(m[3], '');
    else if (m[4]) add(m[4], '');
  }
  return out;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function oneLine(s, max = 90) {
  const t = txt(s).replace(/\[\[[^\]]*\]\]/g, ' ').replace(/[#*_`>[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** The owner's question before a reply (protocol briefs are long: their first line). */
export function questionTitle(conv, turn) {
  return questionBefore(conv, turn);
}

function questionBefore(conv, turn) {
  const turns = turnsOf(conv);
  const at = turns.indexOf(turn);
  for (let i = at - 1; i >= 0; i -= 1) {
    if (turns[i].role === 'user') return oneLine(txt(turns[i].text).split('\n')[0], 80);
  }
  return '';
}

function missionList(turn) {
  const ms = isObj(turn && turn.missions) ? Object.values(turn.missions).filter(isObj) : [];
  return ms.sort((a, b) => (Number(a.wave) || 0) - (Number(b.wave) || 0) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
}

function isRunningMission(m) {
  return m && (m.status === 'planning' || m.status === 'running');
}

function visualTarget(conv, turn, seg) {
  const spec = isObj(seg.spec) ? seg.spec : null;
  return {
    kind: seg.kind,
    ref: { libraryId: typeof seg.libraryId === 'string' ? seg.libraryId : null, segmentId: txt(seg.id) || null, conversationId: conv ? txt(conv.id) || null : null, turnId: txt(turn.id) || null },
    title: oneLine((spec && spec.title) || seg.title || (seg.kind === 'blueprint' ? 'Blueprint' : 'Hologram'), 80),
    live: seg.status === 'building',
  };
}

function missionTarget(conv, turn, mission) {
  return {
    kind: 'mission',
    ref: { conversationId: conv ? txt(conv.id) || null : null, turnId: txt(turn.id) || null, missionId: txt(mission.id) || String(mission.id) },
    title: oneLine(mission.title || questionBefore(conv, turn) || 'Mission', 80),
    live: isRunningMission(mission) || turn.status === 'running',
  };
}

function answerTarget(conv, turn) {
  const report = missionList(turn).length > 0 || segmentsOf(turn).some((s) => s.kind === 'tool');
  return {
    kind: 'answer',
    ref: { conversationId: conv ? txt(conv.id) || null : null, turnId: txt(turn.id) || null, report },
    title: questionBefore(conv, turn) || oneLine(answerMarkdownOf(turn).split('\n')[0], 80) || (report ? 'Report' : 'Answer'),
    live: turn.status === 'running',
  };
}

function hasAnswer(turn) {
  return answerMarkdownOf(turn) !== '' || (turn.status === 'running' && segmentsOf(turn).some((s) => s.kind === 'text'));
}

function photoOfTurn(turn) {
  const atts = Array.isArray(turn.attachments) ? turn.attachments.filter(isObj) : [];
  const img = atts.filter((a) => a.kind === 'image' && typeof a.thumb === 'string' && /^data:image\/(?:jpeg|png|webp|gif);base64,/.test(a.thumb)).pop();
  return img ? { kind: 'photo', ref: { src: img.thumb, title: oneLine(img.name || 'Photo', 80), credit: '' }, title: oneLine(img.name || 'Photo', 80), live: false } : null;
}

/** Newest card of the newest reply (see the header). */
function newestCard(conv) {
  const turns = turnsOf(conv);
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role === 'user') {
      const photo = photoOfTurn(turn);
      if (photo) return photo;
      continue;
    }
    if (turn.role !== 'jarvis') continue;
    const segs = segmentsOf(turn);
    const visuals = segs.filter((s) => (s.kind === 'hologram' || s.kind === 'blueprint') && (s.status !== 'error' || (isObj(s.spec) && Array.isArray(s.spec.parts) && s.spec.parts.length)));
    if (visuals.length) return visualTarget(conv, turn, visuals[visuals.length - 1]);
    const missions = missionList(turn);
    const running = missions.filter(isRunningMission).pop();
    if (running) return missionTarget(conv, turn, running);
    if (hasAnswer(turn)) return answerTarget(conv, turn);
    if (missions.length) return missionTarget(conv, turn, missions[missions.length - 1]);
  }
  return null;
}

function newestOfKind(conv, kind, ordinal) {
  const turns = turnsOf(conv);
  if (kind === 'link') {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const t = turns[i];
      if (t.role !== 'jarvis') continue;
      const links = linksOf(allTextOf(t));
      if (!links.length) continue;
      const n = Number.isInteger(ordinal) ? ordinal : 1;
      const link = n === -1 ? links[links.length - 1] : links[n - 1];
      if (!link) return { error: 'no-link', message: `That reply has ${links.length} link${links.length === 1 ? '' : 's'}.` };
      return { kind: 'link', ref: { url: link.url, title: link.title }, title: link.title, live: false };
    }
    return null;
  }
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (kind === 'photo') {
      if (turn.role === 'user') {
        const p = photoOfTurn(turn);
        if (p) return p;
      }
      continue;
    }
    if (turn.role !== 'jarvis') continue;
    if (kind === 'hologram' || kind === 'blueprint') {
      const segs = segmentsOf(turn).filter((s) => s.kind === kind && (s.status !== 'error' || (isObj(s.spec) && Array.isArray(s.spec.parts) && s.spec.parts.length)));
      if (segs.length) return visualTarget(conv, turn, segs[segs.length - 1]);
    } else if (kind === 'mission') {
      const ms = missionList(turn);
      const pick = ms.filter(isRunningMission).pop() || ms[ms.length - 1];
      if (pick) return missionTarget(conv, turn, pick);
    } else if (kind === 'answer') {
      if (hasAnswer(turn)) return answerTarget(conv, turn);
    }
  }
  return null;
}

/** Every link that appears in the conversation (the tool may only open these). */
export function conversationLinks(conv) {
  const urls = new Set();
  for (const t of turnsOf(conv)) {
    const text = t.role === 'user' ? txt(t.text) : allTextOf(t);
    for (const l of linksOf(text)) urls.add(l.url);
  }
  return urls;
}

/**
 * Resolve a command's object. open: { kind, ref, title } for the open viewer, or null.
 * For the open_screen tool: url (a link that must appear in the conversation) and id (a saved
 * library item: { kind: 'library', ref: { libraryId } }, looked up by the app).
 */
export function resolveScreenTarget({ what = 'this', ordinal = null, open = null, recent = null, conv = null, url = null, id = null } = {}) {
  const want = what || 'this';
  if (typeof id === 'string' && id.trim()) {
    const lid = id.trim();
    if (!LIBRARY_ID.test(lid)) return { error: 'bad-id', message: `"${lid.slice(0, 40)}" is not a saved item id (they look like lib_ab12cd34ef).` };
    return { kind: 'library', ref: { libraryId: lid }, title: '', live: false };
  }
  if (want === 'link' && typeof url === 'string' && url.trim()) {
    const href = cleanUrl(url);
    if (!href) return { error: 'bad-url', message: 'Only http and https links can be opened.' };
    if (!conversationLinks(conv).has(href)) return { error: 'unknown-url', message: 'Only links that appear in this conversation can be opened on a screen.' };
    const known = turnsOf(conv).flatMap((t) => linksOf(t.role === 'user' ? txt(t.text) : allTextOf(t))).find((l) => l.url === href);
    return { kind: 'link', ref: { url: href, title: known ? known.title : hostOf(href) }, title: known ? known.title : hostOf(href), live: false };
  }
  // The camera: Optics' live view. Moved out of an open Optics, Optics closes there (one camera view).
  if (want === 'camera') return { kind: 'camera', ref: {}, title: 'Optics', live: true, ...(isObj(open) && open.kind === 'camera' ? { fromViewer: true } : {}) };
  if (open && isObj(open) && open.kind && (want === 'this' || want === open.kind)) {
    return { kind: open.kind, ref: isObj(open.ref) ? open.ref : {}, title: oneLine(open.title || '', 80), live: !!open.live, fromViewer: true };
  }
  // What was just moved to a screen is still "it" until something newer arrives in the chat.
  if (want === 'this' && isObj(recent) && isObj(recent.target) && recent.target.kind && Number.isFinite(recent.at)) {
    const newer = turnsOf(conv).some((t) => Number(t.createdAt) > recent.at);
    if (!newer) return { ...recent.target, fromViewer: false };
  }
  const found = want === 'this' ? newestCard(conv) : newestOfKind(conv, want, ordinal);
  if (found) return found;
  const noun = { answer: 'answer', mission: 'mission', camera: 'camera view', link: 'link' }[want] || want;
  return { error: 'nothing', message: want === 'this' ? 'There’s nothing to put on a screen yet.' : `There’s no ${noun} in this conversation yet.` };
}

/** A small, JSON-safe copy of a turn for Mission Control on another screen (one mission). */
export function missionSnapshot(turn, missionId) {
  if (!isObj(turn)) return null;
  const missions = isObj(turn.missions) ? turn.missions : {};
  const pick = missions[missionId] || missionList(turn).pop() || null;
  if (!pick) return null;
  return {
    id: txt(turn.id),
    role: 'jarvis',
    status: txt(turn.status) || 'running',
    depth: turn.depth,
    createdAt: turn.createdAt,
    costUsd: Number(turn.costUsd) || 0,
    stats: isObj(turn.stats) ? { ...turn.stats } : {},
    missions: { [pick.id]: pick },
    segments: segmentsOf(turn).filter((s) => s.kind === 'mission' && s.missionId === pick.id),
  };
}

const LOOK_SRC = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
const FRAME_ID = /^f[1-9]\d{0,3}$/;

/**
 * A Look on a screen (Screens × Optics): the frame's picture, its pinned labels and the answer, read
 * from the conversation. The frame is the owner's Look (a user turn with that Optics frame and its
 * attachment's preview) or one Jarvis took itself (a reply's frame segment). -> { data: { src, width,
 * height, frameId, pins: [{ text, x, y }], question, markdown, status }, title } | null
 */
export function lookSnapshot(conv, frameId) {
  if (typeof frameId !== 'string' || !FRAME_ID.test(frameId)) return null;
  const turns = turnsOf(conv);
  let src = '';
  let width = 0;
  let height = 0;
  let question = '';
  let after = null; // { turn, seg }: where the answer starts
  const u = turns.findIndex((t) => t.role === 'user' && isObj(t.optics) && t.optics.frameId === frameId);
  if (u >= 0) {
    const user = turns[u];
    const meta = Array.isArray(user.attachments) && isObj(user.attachments[0]) ? user.attachments[0] : {};
    src = txt(meta.thumb);
    width = Number(user.optics.width) || Number(meta.width) || 0;
    height = Number(user.optics.height) || Number(meta.height) || 0;
    question = txt(user.text) || 'What am I looking at?';
    after = { turn: u + 1, seg: 0 };
  } else {
    for (let i = 0; i < turns.length && !after; i++) {
      const t = turns[i];
      if (t.role !== 'jarvis' || !Array.isArray(t.segments)) continue;
      const j = t.segments.findIndex((x) => isObj(x) && x.kind === 'frame' && x.frameId === frameId);
      if (j < 0) continue;
      const f = t.segments[j];
      src = txt(f.thumb);
      width = Number(f.width) || 0;
      height = Number(f.height) || 0;
      const prev = turns[i - 1];
      question = (prev && prev.role === 'user' ? txt(prev.text) : '') || 'Jarvis took a look';
      after = { turn: i, seg: j + 1 };
    }
  }
  if (!after || !LOOK_SRC.test(src) || !(width > 0) || !(height > 0)) return null;
  let pins = [];
  const parts = [];
  let status = 'done';
  for (let i = after.turn; i < turns.length; i++) {
    const t = turns[i];
    if (t.role !== 'jarvis') continue;
    const segs = Array.isArray(t.segments) ? t.segments : [];
    for (let j = 0; j < segs.length; j++) {
      const x = segs[j];
      if (!isObj(x)) continue;
      // The newest labels on this frame (a follow-up's "What's this part?" pins it again).
      if (x.kind === 'pins' && x.frameId === frameId && x.status !== 'error' && Array.isArray(x.labels) && x.labels.length) {
        pins = x.labels.filter((l) => isObj(l) && typeof l.text === 'string' && Number.isFinite(l.x) && Number.isFinite(l.y)).map((l) => ({ text: l.text.slice(0, 40), x: l.x, y: l.y }));
      }
      if (i === after.turn && j >= after.seg && x.kind === 'text') parts.push(txt(x.text));
    }
    if (i === after.turn) status = txt(t.status) || 'done';
  }
  return { data: { src, width, height, frameId, pins, question: oneLine(question, 200), markdown: parts.filter(Boolean).join('\n\n'), status }, title: oneLine(question, 120) };
}
