// Walkthroughs ("walk me through it", SPEC §29): the plan format v1, its checks, a free local
// planner, the words said during a tour, and the rule that keeps the hologram in step with what
// Jarvis says. Pure: no DOM; the line sync takes a clock.
//
//   normalizeTourPlan(plan, spec)        -> { plan, warnings, ok }   checks a plan against its hologram
//   localTourPlan(spec, { partId })      -> plan | null              free, offline, in the owner's order
//   matchTourStart(text, { parts, title }) -> { action: 'tour-start', partId } | null
//   matchTourCommand(text, ctx)          -> { action: 'tour-next' | … } | null   (only while a tour runs)
//   choiceReply(text, choices, { defaultId }) -> a choice id | null
//   matchShowView(text)                  -> 'enclosed' | 'opened' | null ("show it enclosed", any time)
//   partViewShow(spec, partId, view)     -> a step's `show` for that view of one part
//   narrationText(steps)                 -> { text, lines: [{ id, start, end }] } (one step per line)
//   createLineSync({ lines, onLine, … }) -> applies each line once: on its chunk start, else by fallback
//
// A plan (v1):
//   { v: 1, title, for: partId | null, source: 'local' | 'claude', steps: [step, …] }
//   step: { id, say?, parts?: [ids, main first], show?, wait?, ask?, choices?, default?, next? }
//   show (every field optional; what a step leaves out stays as it was):
//     explode 0..1 · glow [ids] · ghost [ids] | 'shells' · hide [ids] · others 0..1 (the rest's level)
//     labels 'none' | 'parts' (the step's parts) | 'all' · frame 'parts' | 'all' · zoom (1 = fit)
//     camera: a view name | 'access' (from the side the main part comes out of) | { dir: [x, y, z] }
//     card: true (the main part's card: its material on screen, not said) | false · photos: true
//   ask + choices (2-4 of { id, label, goto, words? }) + default: a decision; it always waits.
//   wait: true waits for "next" after the step. next: the step after this one (forward only).
// Text is cleaned like a hologram's (cleanText): one line, no control characters. Unknown part
// ids are dropped with a warning. At most 24 steps, 280 characters a step, 3,000 in all.

import { cleanText, normalizeHologramSpec, normalizeId, partBounds, specBounds, VIEWS } from './hologram-spec.js';
import { normalizeCommandText, resolvePart } from './hologram-commands.js';

export const TOUR_PLAN_VERSION = 1;
export const TOUR_LIMITS = Object.freeze({ steps: 24, say: 280, spoken: 3000, title: 80, label: 40, choices: 4, words: 6, parts: 24 });
/** "You pick" (and "next" at a decision) takes this view: the owner's own first choice. */
export const DEFAULT_VIEW_CHOICE = 'enclosed';
/** The local part tour's decision, in the owner's words. */
export const VIEW_QUESTION = 'Do you want to see it enclosed, or opened?';

const LABELS = ['none', 'parts', 'all'];
const FRAMES = ['parts', 'all'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NaN);

// ---------------------------------------------------------------------------------------------
// Shells and where a part sits (local plans and the enclosed / opened views)

// Case parts: tone `secondary` (the tool asks for it on housings, shells and body panels) or a
// shell-like name. The renderer's ghost: 'shells' uses the same rule.
const SHELL_NAME = /\b(?:covers?|case|casing|housings?|shells?|lids?|cowl|cowling|can|sleeve|enclosure)\b/i;
/** Whether a hologram part is part of the case (ghosted in the enclosed view). */
export function isShellPart(part) {
  return !!part && (part.tone === 'secondary' || SHELL_NAME.test(String(part.name || '')));
}

/** A normalized spec (or null): accepts a raw show_hologram input or an already normalized spec. */
function specOf(input) {
  if (!isObj(input) || !Array.isArray(input.parts) || !input.parts.length) return null;
  const res = normalizeHologramSpec(input);
  return res && res.ok && res.spec && res.spec.parts.length ? res.spec : null;
}

function analyze(spec) {
  const parts = spec.parts.map((p) => ({ p, b: partBounds(p) })).filter((x) => x.b);
  return { spec, model: specBounds(spec), parts, byId: new Map(parts.map((x) => [x.p.id, x])) };
}

const centerOf = (b) => b.min.map((v, k) => (v + b.max[k]) / 2);
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const volume = (b) => b.size.reduce((a, v) => a * Math.max(v, 1e-3), 1);

/** An explode vector worth the name (null, a zero vector or a missing one: none). */
function explodeOf(part) {
  const e = part && Array.isArray(part.explode) ? part.explode : null;
  return e && e.length === 3 && e.every(Number.isFinite) && Math.hypot(...e) > 1e-6 ? e : null;
}

/** The shells around a part: those that contain its center, or lie over it (60 % of it across two axes, beyond it on the third). */
function coversOf(A, id) {
  const t = A.byId.get(id);
  if (!t) return [];
  const out = [];
  const c = centerOf(t.b);
  for (const s of A.parts) {
    if (s === t || !isShellPart(s.p)) continue;
    const ov = [0, 1, 2].map((k) => overlap(t.b.min[k], t.b.max[k], s.b.min[k], s.b.max[k]) / Math.max(1e-6, t.b.max[k] - t.b.min[k]));
    const contains = [0, 1, 2].every((k) => c[k] >= s.b.min[k] - 1e-6 && c[k] <= s.b.max[k] + 1e-6);
    let side = null;
    for (let k = 0; k < 3 && !side; k++) {
      if (![0, 1, 2].filter((j) => j !== k).every((j) => ov[j] >= 0.6)) continue;
      if (s.b.min[k] >= t.b.max[k] - 1e-6) side = { axis: k, dir: 1 };
      else if (s.b.max[k] <= t.b.min[k] + 1e-6) side = { axis: k, dir: -1 };
    }
    if (side) out.push({ id: s.p.id, name: s.p.name, side, contains: false });
    else if (contains) out.push({ id: s.p.id, name: s.p.name, side: null, contains: true });
  }
  return out;
}

/** Parts that touch it (within 4 % of the model's size), not shells: the nearest first, then the biggest. */
function neighboursOf(A, id, max = 3) {
  const t = A.byId.get(id);
  if (!t || !A.model) return [];
  const tol = Math.max(...A.model.size) * 0.04;
  const gapOf = (b) => Math.hypot(...[0, 1, 2].map((k) => Math.max(0, b.min[k] - t.b.max[k], t.b.min[k] - b.max[k])));
  return A.parts
    .filter((x) => x !== t && !isShellPart(x.p) && gapOf(x.b) <= tol)
    .map((x) => ({ id: x.p.id, name: x.p.name, gap: gapOf(x.b), vol: volume(x.b) }))
    .sort((a, b) => a.gap - b.gap || b.vol - a.vol)
    .slice(0, max);
}

/** "low down, toward the front": the part's center within the model (+x front, +y up, +z right). */
function positionWords(A, id) {
  const t = A.byId.get(id);
  if (!t || !A.model) return '';
  const c = centerOf(t.b);
  const rel = [0, 1, 2].map((k) => (c[k] - A.model.min[k]) / Math.max(1e-6, A.model.size[k]) - 0.5);
  const words = [];
  if (rel[1] < -0.2) words.push('low down');
  else if (rel[1] > 0.2) words.push('up high');
  if (rel[0] > 0.15) words.push('toward the front');
  else if (rel[0] < -0.15) words.push('toward the back');
  if (rel[2] > 0.15) words.push('on the right');
  else if (rel[2] < -0.15) words.push('on the left');
  return words.join(', ');
}

// One cover on one side: where the part is from it (+x front, +y up, +z right).
const BESIDE = [
  ['in front of', 'behind'], // the cover lies toward -x / +x of the part
  ['above', 'under'], // -y / +y
  ['to the right of', 'to the left of'], // -z / +z
];

/**
 * Where a part sits and the way in to it, for the local plan's sentences:
 *   { covers, clear, where, access, wayIn, neighbours }
 * "Where" and "the way in" are said only when they are clear: one or two covers on one axis, with
 * different names (else "inside the case": a car's battery is under four body panels at once).
 * `access` (the covers on the side it comes out of) is hidden in the opened view either way.
 */
export function partPlacement(specInput, partId) {
  const spec = specOf(specInput);
  if (!spec) return null;
  const A = analyze(spec);
  const t = A.byId.get(partId);
  if (!t) return null;
  const covers = coversOf(A, partId);
  const names = covers.map((c) => spokenName(c.name));
  const sided = covers.filter((c) => c.side);
  const clear = covers.length > 0 && covers.length <= 2 && sided.length === covers.length && sided.every((c) => c.side.axis === sided[0].side.axis) && new Set(names).size === names.length;
  const pos = positionWords(A, partId);
  let rel = '';
  if (clear && covers.length === 2 && covers[0].side.dir !== covers[1].side.dir) rel = `between ${names[0]} and ${names[1]}`;
  else if (clear) rel = `${BESIDE[covers[0].side.axis][covers[0].side.dir > 0 ? 1 : 0]} ${list(names)}`;
  else if (covers.length) {
    const inside = covers.filter((c) => c.contains);
    rel = inside.length === 1 ? `inside ${spokenName(inside[0].name)}` : 'inside the case';
  }
  const where = [pos, rel].filter(Boolean).join(', ');
  const e = explodeOf(t.p);
  let access = [];
  if (e) {
    const k = [0, 1, 2].reduce((best, j) => (Math.abs(e[j]) > Math.abs(e[best]) ? j : best), 0);
    const dir = Math.sign(e[k]);
    access = sided.filter((c) => c.side.axis === k && c.side.dir === dir).map((c) => c.id);
  }
  const accessNames = access.map((id) => spokenName(A.byId.get(id).p.name));
  const wayIn = clear && access.length === 1 ? accessNames[0] : '';
  return { covers: covers.map((c) => c.id), clear, where, access, wayIn, neighbours: neighboursOf(A, partId).map((n) => n.id), explode: !!e };
}

// ---------------------------------------------------------------------------------------------
// Words for the ear

/** "Battery (57 Wh)" -> "the battery"; "M.2 SSD" stays "the M.2 SSD"; proper names keep their capitals. */
export function spokenName(name) {
  return `the ${spokenWords(name)}`;
}

function spokenWords(name) {
  const s = String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the\s+/i, '');
  const words = s.split(' ');
  const first = words[0] || '';
  // Sentence case ("Battery connector") reads in lower case; "Eiffel Tower" or "DC-DC converter" don't.
  const plain = /^[A-Z][a-z'’-]*$/.test(first) && words.slice(1).every((w) => !/[A-Z]/.test(w));
  return plain ? first.toLowerCase() + s.slice(first.length) : s;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
function list(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The first sentence of a part's info (at least about 20 characters, so "Approx." doesn't end it). */
function firstSentence(text) {
  const s = String(text || '').trim();
  const re = /[.!?](?=\s|$)/g;
  let m;
  while ((m = re.exec(s))) if (m.index >= 19) return s.slice(0, m.index + 1);
  return s;
}

// ---------------------------------------------------------------------------------------------
// The local planner (free, offline): object tours and part tours

/**
 * A walkthrough planned from the hologram alone. No partId: the object tour (overview, taken
 * apart, one step per group on its most important part, the end). A partId: the part tour in the
 * owner's order: overview → it comes apart and the camera flies in to the part → "Do you want to
 * see it enclosed, or opened?" → enclosed (back together, the case see-through, the part glowing
 * where it sits) | opened (the cover on its side hidden, the camera on it from that side) | both |
 * you pick (enclosed) → its info → its neighbours → the end. null without a hologram (or an
 * unknown part).
 */
export function localTourPlan(specInput, { partId = null } = {}) {
  const spec = specOf(specInput);
  if (!spec) return null;
  const A = analyze(spec);
  if (!A.parts.length) return null;
  const plan = partId ? partTour(spec, A, partId) : objectTour(spec, A);
  if (!plan) return null;
  const res = normalizeTourPlan(plan, spec);
  return res.ok ? res.plan : null;
}

function overviewStep(spec, say) {
  return { id: 'overview', say, show: { explode: 0, glow: [], ghost: [], hide: [], labels: 'none', frame: 'all', camera: spec.view || 'front-left', card: false } };
}

function partTour(spec, A, partId) {
  const t = A.byId.get(partId);
  if (!t) return null;
  const part = t.p;
  const place = partPlacement(spec, partId);
  const the = spokenName(part.name);
  const hasWay = place.explode; // no explode vector: no "way in", no "opened" choice
  const access = hasWay ? 'access' : undefined;
  const where = place.where ? ` It sits ${place.where}.` : '';
  const enclosedShow = { explode: 0, glow: [partId], ghost: 'shells', hide: [], labels: 'parts', frame: 'all', camera: access || spec.view || 'front-left' };
  const steps = [
    overviewStep(spec, `Here's ${spokenTitle(spec.title)}, assembled.`),
    { id: 'apart', parts: [partId], say: `Taken apart, this is ${the}.`, show: { explode: 1, glow: [partId], ghost: [], hide: [], labels: 'parts', frame: 'parts', camera: access } },
  ];
  if (hasWay) {
    steps.push({
      id: 'ask',
      ask: VIEW_QUESTION,
      choices: [
        { id: 'enclosed', label: 'Enclosed', goto: 'enclosed' },
        { id: 'opened', label: 'Opened', goto: 'opened' },
        { id: 'both', label: 'Both', goto: 'both' },
        { id: 'pick', label: 'You pick', goto: DEFAULT_VIEW_CHOICE },
      ],
      default: DEFAULT_VIEW_CHOICE,
    });
  }
  steps.push({ id: 'enclosed', parts: [partId], say: `Here it is back together, with the case see-through.${where}`, show: enclosedShow, next: firstAfterViews(part, place) });
  if (hasWay) {
    steps.push({ id: 'both', parts: [partId], say: `First, enclosed: back together, with the case see-through.${where}`, show: enclosedShow, next: 'opened' });
    // The cover on its side comes off; with none found, it is shown taken apart instead.
    const off = place.access;
    steps.push({
      id: 'opened',
      parts: [partId],
      say: place.wayIn ? `With ${place.wayIn} off, here's ${the}.` : `Opened up, here's ${the}.`,
      show: { explode: off.length ? 0 : 1, glow: [partId], ghost: 'shells', hide: off, labels: 'parts', frame: 'parts', camera: 'access' },
    });
  }
  const info = firstSentence(part.info);
  if (info) steps.push({ id: 'info', parts: [partId], say: info, show: { card: true } });
  if (place.neighbours.length) {
    const names = place.neighbours.map((id) => spokenName(A.byId.get(id).p.name));
    steps.push({ id: 'neighbours', parts: [partId, ...place.neighbours], say: `Next to it: ${list(names)}.`, show: { glow: [partId, ...place.neighbours], labels: 'parts', frame: 'parts' } });
  }
  steps.push({ id: 'end', parts: [partId], say: `That's ${the}. Ask me anything about it, or say "back" to see it again.`, show: { ...enclosedShow, camera: spec.view || 'front-left' } });
  return { v: TOUR_PLAN_VERSION, title: `${part.name}: ${spec.title}`, for: partId, source: 'local', steps };
}

/** The step after the enclosed and opened views: its info, else its neighbours, else the end. */
function firstAfterViews(part, place) {
  if (firstSentence(part.info)) return 'info';
  return place.neighbours.length ? 'neighbours' : 'end';
}

function objectTour(spec, A) {
  const n = spec.parts.length;
  const steps = [
    overviewStep(spec, `Here's ${spokenTitle(spec.title)}, assembled.`),
    { id: 'apart', say: `Taken apart, it has ${n} main part${n === 1 ? '' : 's'}.`, show: { explode: 1, glow: [], ghost: [], hide: [], labels: 'all', frame: 'all' } },
  ];
  // Accent and warning parts matter most, then the biggest (outer shells last).
  const rank = (x) => (x.p.tone === 'accent' || x.p.tone === 'warning' ? 2 : isShellPart(x.p) ? 0 : 1) * 1e15 + volume(x.b);
  const body = [];
  if (spec.groups.length) {
    for (const g of spec.groups) {
      const members = A.parts.filter((x) => x.p.group === g.id);
      if (!members.length) continue;
      const key = members.slice().sort((a, b) => rank(b) - rank(a))[0].p;
      body.push({ id: `g-${g.id}`, key, say: groupSentence(g.name, key) });
    }
  } else {
    // No groups: one step per big part, in spec order (the outer structure first).
    const big = new Set(A.parts.slice().sort((a, b) => volume(b.b) - volume(a.b)).slice(0, 6));
    for (const x of A.parts) if (big.has(x)) body.push({ id: `p-${x.p.id}`, key: x.p, say: groupSentence('', x.p) });
  }
  const end = { id: 'end', say: 'That\'s the tour. Ask about any part, or say "walk me through" and its name.', show: { explode: 0, glow: [], ghost: [], hide: [], labels: 'all', frame: 'all', camera: spec.view || 'front-left', card: false } };
  // Room for the end within the limits: the last groups give way.
  let spoken = steps.reduce((a, s) => a + s.say.length, 0) + end.say.length;
  for (const b of body) {
    if (steps.length + 1 >= TOUR_LIMITS.steps || spoken + b.say.length > TOUR_LIMITS.spoken) break;
    spoken += b.say.length;
    steps.push({ id: b.id, parts: [b.key.id], say: b.say, show: { explode: 1, glow: [b.key.id], labels: 'parts', frame: 'parts', card: true } });
  }
  steps.push(end);
  return { v: TOUR_PLAN_VERSION, title: spec.title, for: null, source: 'local', steps };
}

function groupSentence(groupName, part) {
  const info = firstSentence(part.info);
  const head = groupName ? `${groupName}: ${spokenName(part.name)}.` : `${cap(spokenName(part.name))}.`;
  return info ? `${head} ${info}` : head;
}

/** "the 14-inch laptop", "the car alternator", "the 2024 Toyota Camry Hybrid" (no brackets). */
function spokenTitle(title) {
  const s = spokenWords(title);
  return s ? `the ${s}` : 'the model';
}

/**
 * The enclosed or opened view of one part, outside a tour ("show it enclosed" with a part
 * selected): a step's `show`, or null when the part is unknown (or has no way in, for opened).
 */
export function partViewShow(specInput, partId, view) {
  const place = partPlacement(specInput, partId);
  if (!place) return null;
  if (view === 'enclosed') return { explode: 0, glow: [partId], ghost: 'shells', hide: [], labels: 'parts', frame: 'all', camera: place.explode ? 'access' : undefined };
  if (view === 'opened' && place.explode) return { explode: place.access.length ? 0 : 1, glow: [partId], ghost: 'shells', hide: place.access, labels: 'parts', frame: 'parts', camera: 'access' };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Checking a plan

/**
 * Check a plan against its hologram (a local plan, or one Claude wrote). Unknown part ids are
 * dropped with a warning; text is cleaned and cut; ids are made unique; a `next` must point to a
 * later step (so a plan can't loop by itself) and a choice's `goto` at a step; a decision keeps
 * 2-4 choices and a default; a step with no words and no parts is dropped; at most 24 steps and
 * 3,000 spoken characters (the rest is dropped). Returns { plan, warnings, ok }.
 */
export function normalizeTourPlan(input, specInput) {
  const warnings = [];
  const warn = (m) => {
    if (warnings.length < 30) warnings.push(m);
  };
  let src = input;
  if (typeof src === 'string') {
    try {
      src = JSON.parse(src);
    } catch {
      return { plan: null, warnings: ['The plan is not valid JSON.'], ok: false };
    }
  }
  if (!isObj(src) || !Array.isArray(src.steps)) return { plan: null, warnings: ['A plan needs a list of steps.'], ok: false };
  const spec = specOf(specInput);
  if (!spec) return { plan: null, warnings: ['There is no hologram to walk through.'], ok: false };
  const ids = new Set(spec.parts.map((p) => p.id));
  if (src.v !== undefined && Number(src.v) !== TOUR_PLAN_VERSION) warn(`v: ${String(src.v).slice(0, 8)} is not 1; read as 1.`);

  const partIds = (value, where) => {
    const out = [];
    for (const raw of Array.isArray(value) ? value : typeof value === 'string' ? [value] : []) {
      const id = normalizeId(raw);
      if (!id || !ids.has(id)) {
        warn(`${where}: unknown part "${cleanText(raw, 40)}" dropped.`);
        continue;
      }
      if (!out.includes(id) && out.length < TOUR_LIMITS.parts) out.push(id);
    }
    return out;
  };

  const used = new Set();
  let steps = [];
  for (const [i, raw] of src.steps.entries()) {
    if (i >= 60) break; // far past the limit: not worth reading
    if (!isObj(raw)) {
      warn(`step ${i + 1}: not an object; dropped.`);
      continue;
    }
    let id = normalizeId(raw.id) || `s${i + 1}`;
    for (let n = 2; used.has(id); n++) id = `${(normalizeId(raw.id) || `s${i + 1}`).slice(0, 36)}-${n}`;
    const label = `step ${id}`;
    const step = { id };
    const say = cleanText(raw.say, TOUR_LIMITS.say);
    if (say) step.say = say;
    const parts = partIds(raw.parts, `${label} parts`);
    if (parts.length) step.parts = parts;
    const show = normalizeShow(raw.show, partIds, label);
    if (Object.keys(show).length) step.show = show;
    if (raw.wait === true) step.wait = true;
    if (typeof raw.next === 'string' && normalizeId(raw.next)) step.next = normalizeId(raw.next);
    const ask = cleanText(raw.ask, TOUR_LIMITS.say);
    if (ask) {
      const choices = [];
      for (const c of Array.isArray(raw.choices) ? raw.choices : []) {
        if (!isObj(c) || choices.length >= TOUR_LIMITS.choices) continue;
        const cid = normalizeId(c.id) || normalizeId(c.label);
        const go = normalizeId(c.goto);
        if (!cid || !go || choices.some((x) => x.id === cid)) continue;
        const choice = { id: cid, label: cleanText(c.label, TOUR_LIMITS.label) || cap(cid.replace(/[-_]+/g, ' ')), goto: go };
        const words = (Array.isArray(c.words) ? c.words : []).map((w) => cleanText(w, TOUR_LIMITS.label)).filter(Boolean).slice(0, TOUR_LIMITS.words);
        if (words.length) choice.words = words;
        choices.push(choice);
      }
      step.ask = ask;
      step.choices = choices;
      const def = normalizeId(raw.default);
      step.default = choices.some((c) => c.id === def) ? def : choices.length ? choices[0].id : '';
    }
    if (!step.say && !step.ask && !step.parts) {
      warn(`${label}: no words and no parts; dropped.`);
      continue;
    }
    used.add(id);
    steps.push(step);
  }

  // The limits: 24 steps, 3,000 spoken characters.
  let spoken = 0;
  const kept = [];
  for (const s of steps) {
    const n = (s.say || '').length + (s.ask || '').length;
    if (kept.length >= TOUR_LIMITS.steps || spoken + n > TOUR_LIMITS.spoken) {
      warn(`The plan is too long: ${steps.length - kept.length} step(s) from "${s.id}" on dropped.`);
      break;
    }
    spoken += n;
    kept.push(s);
  }
  steps = kept;

  // References: a next points forward, a goto at a step; a decision keeps 2-4 choices.
  for (let changed = true; changed; ) {
    changed = false;
    const index = new Map(steps.map((s, i) => [s.id, i]));
    for (const [i, s] of steps.entries()) {
      if (s.next && !(index.get(s.next) > i)) {
        warn(`step ${s.id}: next "${s.next}" is not a later step; ignored.`);
        delete s.next;
      }
      if (!s.ask) continue;
      for (const c of s.choices) if (!index.has(c.goto)) warn(`step ${s.id}: choice "${c.id}" leads to "${c.goto}", which is no step; dropped.`);
      s.choices = s.choices.filter((c) => index.has(c.goto));
      if (s.choices.length >= 2) {
        if (!s.choices.some((c) => c.id === s.default)) s.default = s.choices[0].id;
        continue;
      }
      warn(`step ${s.id}: a decision needs 2 to 4 choices; it is said instead.`);
      delete s.ask;
      delete s.choices;
      delete s.default;
      if (!s.say && !s.parts) {
        steps.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  const forId = normalizeId(src.for);
  const plan = {
    v: TOUR_PLAN_VERSION,
    title: cleanText(src.title, TOUR_LIMITS.title) || cleanText(spec.title, TOUR_LIMITS.title) || 'Walkthrough',
    for: forId && ids.has(forId) ? forId : null,
    source: src.source === 'local' ? 'local' : 'claude',
    steps,
  };
  return { plan, warnings, ok: steps.length > 0 };
}

function normalizeShow(raw, partIds, label) {
  if (!isObj(raw)) return {};
  const out = {};
  const e = finite(raw.explode);
  if (Number.isFinite(e)) out.explode = clamp(e, 0, 1);
  for (const k of ['glow', 'hide']) if (raw[k] !== undefined) out[k] = partIds(raw[k], `${label} ${k}`);
  if (raw.ghost !== undefined) out.ghost = raw.ghost === 'shells' ? 'shells' : partIds(raw.ghost, `${label} ghost`);
  // `lift` (one cover off along its way out) is shown as hidden until the renderer can lift a part.
  if (raw.lift !== undefined) {
    const lifted = partIds(Array.isArray(raw.lift) || typeof raw.lift === 'string' ? raw.lift : isObj(raw.lift) ? Object.keys(raw.lift) : [], `${label} lift`);
    out.hide = [...new Set([...(out.hide || []), ...lifted])];
  }
  const others = finite(raw.others);
  if (Number.isFinite(others)) out.others = clamp(others, 0, 1);
  if (LABELS.includes(raw.labels)) out.labels = raw.labels;
  // camera: a view, 'access' or { dir }; the probe's { frame, view, from } is read too.
  let cam = raw.camera;
  let frame = raw.frame;
  if (isObj(cam) && !Array.isArray(cam.dir)) {
    if (frame === undefined && cam.frame !== undefined) frame = cam.frame;
    cam = cam.from === 'access' ? 'access' : cam.view;
  }
  if (cam === 'access' || VIEWS.includes(cam)) out.camera = cam;
  else if (isObj(cam) && Array.isArray(cam.dir) && cam.dir.length === 3) {
    const dir = cam.dir.map(finite);
    if (dir.every(Number.isFinite) && Math.hypot(...dir) > 1e-6) out.camera = { dir };
  }
  if (frame === 'model') frame = 'all';
  if (FRAMES.includes(frame)) out.frame = frame;
  const zoom = finite(raw.zoom);
  if (Number.isFinite(zoom) && zoom > 0) out.zoom = clamp(zoom, 0.25, 4);
  if (typeof raw.card === 'boolean') out.card = raw.card;
  if (raw.photos === true) out.photos = true;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Walking a plan

export const isDecision = (step) => !!(step && step.ask && Array.isArray(step.choices) && step.choices.length >= 2);

export function stepById(plan, id) {
  return (plan && Array.isArray(plan.steps) && plan.steps.find((s) => s.id === id)) || null;
}

/** The step after `id` (its `next`, else the one below it); null at the end or after a decision. */
export function nextStepId(plan, id) {
  const steps = (plan && plan.steps) || [];
  const i = steps.findIndex((s) => s.id === id);
  if (i < 0 || isDecision(steps[i])) return null;
  if (steps[i].next) return steps[i].next;
  return i + 1 < steps.length ? steps[i + 1].id : null;
}

/**
 * The steps spoken as one run from `id`: up to and including a `wait` step, up to a decision (a
 * decision's own words, if it has any, end the run), or the end.
 */
export function runFrom(plan, id) {
  const out = [];
  const seen = new Set();
  for (let cur = id; cur && !seen.has(cur); cur = nextStepId(plan, cur)) {
    seen.add(cur);
    const step = stepById(plan, cur);
    if (!step) break;
    if (isDecision(step)) {
      if (step.say) out.push(step);
      break;
    }
    out.push(step);
    if (step.wait) break;
  }
  return out;
}

/** The step ids from the first step to the end, taking each decision's choice made so far, else its default. */
export function tourPath(plan, chosen = {}) {
  const out = [];
  const steps = (plan && plan.steps) || [];
  const seen = new Set();
  for (let cur = steps.length ? steps[0].id : null; cur && !seen.has(cur); ) {
    seen.add(cur);
    out.push(cur);
    const step = stepById(plan, cur);
    if (isDecision(step)) {
      const pick = step.choices.find((c) => c.id === chosen[cur]) || step.choices.find((c) => c.id === step.default) || step.choices[0];
      cur = pick.goto;
    } else cur = nextStepId(plan, cur);
  }
  return out;
}

/**
 * The run spoken as one text, one step per line, and where each step starts in what the voice
 * engine gets (whitespace collapsed, as Voice Mode's spokenForm does: a line break is one space).
 */
export function narrationText(steps) {
  const lines = [];
  let at = 0;
  const parts = [];
  for (const s of steps || []) {
    const say = cleanText(s && s.say, TOUR_LIMITS.say);
    if (!say) continue;
    lines.push({ id: s.id, start: at, end: at + say.length });
    parts.push(say);
    at += say.length + 1;
  }
  return { text: parts.join('\n'), lines };
}

/** How a voice paces a tour: the fallback before a step is shown without a chunk event, and its speed. */
export function voicePacing(voice = {}, rate = 1) {
  const r = Number(rate) > 0 ? Number(rate) : 1;
  const kind = voice && voice.kind;
  // George: his first words come 1-2 s after speak(), and his stall watchdog waits up to 3.5 s.
  if (kind === 'george') return { fallbackMs: 4000, cps: 13 * r };
  // No voice (speech off or no Voice Mode): shown at once, moved on by estimate.
  if (kind === 'none') return { fallbackMs: 0, cps: 14.5 * r };
  // The device's own voice: 1.5 s when it sends start events, else the engine's own 3 s assumption.
  return { fallbackMs: voice && voice.startEvents === true ? 1500 : 3000, cps: 14.5 * r };
}

/**
 * Keeps the hologram in step with the narration: onLine(i) is called once per line, in order, when
 * a chunk starts at (or past) the line's offset. With no chunk event within `fallbackMs` the first
 * line is shown anyway and the rest follow by estimate (`cps` characters a second), until a real
 * chunk event arrives: then only chunk events move it on.
 *   const sync = createLineSync({ lines, onLine, clock, fallbackMs, cps }); sync.start();
 *   sync.chunk({ start }) on each chunk start; sync.flush() when the speech ends; sync.cancel()
 */
export function createLineSync({ lines = [], onLine = () => {}, clock = null, fallbackMs = 3000, cps = 14.5 } = {}) {
  const c = clock || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) };
  let next = 0;
  let real = false;
  let done = false;
  let timers = [];
  const clear = () => {
    for (const t of timers) c.clearTimeout(t);
    timers = [];
  };
  const showTo = (k) => {
    while (!done && next <= k && next < lines.length) onLine(next++);
  };
  const estimateFrom = (i) => {
    for (let k = i + 1; k < lines.length; k++) {
      const ms = Math.max(0, ((lines[k].start - lines[i].start) / Math.max(1, cps)) * 1000);
      timers.push(c.setTimeout(() => !real && showTo(k), ms));
    }
  };
  return {
    start() {
      if (done || !lines.length) return;
      const first = () => {
        if (real || done) return;
        showTo(0);
        estimateFrom(0);
      };
      if (fallbackMs <= 0) first();
      else timers.push(c.setTimeout(first, fallbackMs));
    },
    chunk(chunk) {
      const start = Number(chunk && chunk.start);
      if (done || !Number.isFinite(start)) return;
      real = true;
      clear();
      // A line starts at its offset; the space before it counts (an engine may start a chunk there).
      let k = next - 1;
      for (let i = next; i < lines.length && lines[i].start <= start + 1; i++) k = i;
      showTo(k);
    },
    flush() {
      clear();
      showTo(lines.length - 1);
    },
    cancel() {
      clear();
      done = true;
    },
    get real() {
      return real;
    },
    get shown() {
      return next;
    },
  };
}

/** What a step shows, in a word (the turn context's "the battery, opened"): enclosed | opened | apart | ''. */
export function viewWord(look) {
  if (!isObj(look)) return '';
  if (Array.isArray(look.hide) && look.hide.length) return 'opened';
  if (Number(look.explode) >= 0.5) return 'apart';
  if (look.ghost === 'shells' || (Array.isArray(look.ghost) && look.ghost.length)) return 'enclosed';
  return '';
}

// ---------------------------------------------------------------------------------------------
// Tour words (whole sentences only; u-holo §4.2). normalizeCommandText writes number words as
// digits, so "one second" is matched as "1 second".

const LEAD = /^(?:(?:hey|ok|okay|alright|all right|so|and|then|now|um|uh|er|well|jarvis|please)\b,?\s*|(?:can|could|would|will) you(?: please)?\s+|(?:let's|lets|let us|i want to|i'd like to|i would like to|i wanna)\s+)/;
const TRAIL = /\s+(?:please|thanks|thank you|now|jarvis|for me)$/;

function words(text) {
  let s = normalizeCommandText(text);
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(LEAD, '').replace(TRAIL, '').trim();
  }
  return s;
}

const NEXT = /^(?:next|next step|next 1|next part|the next step|go on|continue|keep going|carry on|move on|go ahead|what's next|whats next|what is next|what's next then|skip|skip it|skip this|skip that|skip this 1|skip this step|skip that step|skip ahead|go forward|forward|onward|onwards)$/;
const GO_ON = /^(?:continue|go on|keep going|carry on|move on|go ahead)$/; // resume while paused
const READY = /^(?:ok|okay|ok next|okay next|got it|yes|yeah|yep|yup|sure|done|ready|i'm ready|im ready|all set|alright|all right|sounds good|mhm|uh huh|right)$/;
const BACK = /^(?:back|go back|previous|previous step|previous 1|the previous step|back 1|back 1 step|go back 1|go back 1 step|go back a step|1 step back|step back|last step|the last step|rewind)$/;
const REPEAT = /^(?:repeat|repeat that|repeat it|repeat this|repeat the step|repeat this step|repeat that step|say that again|say it again|again|1 more time|pardon|pardon me|come again|what did you say|sorry what did you say)$/;
const PAUSE = /^(?:pause|pause it|pause the tour|pause the walkthrough|wait|wait a second|wait a sec|wait a minute|wait a moment|wait 1 second|wait 1 sec|hold on|hold on a second|hold on 1 second|hold on a sec|hang on|hang on a second|hang on 1 second|hang on a sec|hold it|hold up|1 second|1 sec|1 moment|just a second|just a sec|just a moment|a second|give me a second|give me a sec|give me a moment|stop|stop there|freeze)$/;
const RESUME = /^(?:resume|resume it|resume the tour|resume the walkthrough|play|unpause|continue the tour|continue the walkthrough|keep going with the tour|go on with the tour|carry on with the tour|back to the tour|go back to the tour)$/;
const END = /^(?:(?:stop|end|exit|quit|cancel|finish|close|leave)(?: the| this)? (?:tour|walkthrough|walk through|guided tour)|that's enough|thats enough|that is enough|enough|we're done|were done|we are done|i'm done|im done|i am done|no more tour)$/;
const JUMP = /^(?:go|skip|jump|move|fast forward) (?:ahead |forward |straight )?to (?:the )?(.+)$|^(?:take|bring) (?:me|us) to (?:the )?(.+)$/;

// The views: "enclosed" (back together, the case see-through) and "opened" (the cover off).
const ENCLOSED_WORDS = "(?:enclosed|closed|closed up|in place|in its place|assembled|put together|back together|together|inside the case|in the case|with the case on|with the cover on|covered)";
const OPENED_WORDS = "(?:opened|opened up|open|open up|open it|open it up|apart|taken apart|take it apart|take apart|with the cover off|with the case off|cover off|uncovered|exposed)";
const VIEW_LEAD = "(?:(?:show|see|let me see|i want to see|i'd like to see|can i see|could i see|go with|i'll go with|i'll take|take|do|make it|leave it|keep it|we'll do|i choose|i pick|pick|choose)(?: me| us)?(?: it| that| this| them| the (?:[a-z0-9'-]+ ){0,3}?[a-z0-9'-]+)?(?: to me)? )?(?:the )?";
const VIEW_TAIL = "(?: (?:1|view|version|way|please))?";
const ENCLOSED_RE = new RegExp(`^${VIEW_LEAD}${ENCLOSED_WORDS}${VIEW_TAIL}$`);
const OPENED_RE = new RegExp(`^${VIEW_LEAD}${OPENED_WORDS}${VIEW_TAIL}$`);
// Outside a decision only these say which view: an explicit "show …" with enclosed or opened, or the bare words.
const SHOW_ENCLOSED = /^(?:(?:show|let me see|i want to see|can i see)(?: me)? (?:it|that|this|them|the (?:[a-z0-9'-]+ ){0,3}?[a-z0-9'-]+)(?: to me)? (?:enclosed|closed up|in place|inside the case|in the case)|enclosed)$/;
const SHOW_OPENED = /^(?:(?:show|let me see|i want to see|can i see)(?: me)? (?:it|that|this|them|the (?:[a-z0-9'-]+ ){0,3}?[a-z0-9'-]+)(?: to me)? (?:opened|opened up|open|with the cover off|uncovered)|opened)$/;
const BOTH = /^(?:(?:show|see|let me see|i want to see|i'd like to see|do|go with|i'll take)(?: me| us)? )?(?:both|both of them|both of those|both ways|both views|both please|each|(?:the )?enclosed (?:and|then|and then) (?:the )?opened|(?:the )?opened (?:and|then|and then) (?:the )?enclosed|first enclosed then opened)$/;
const PICK = /^(?:you pick|you choose|you decide|you pick 1|you choose 1|your pick|your choice|your call|you call it|up to you|it's up to you|its up to you|dealer's choice|dealers choice|either|either 1|either is fine|either way|either works|whichever|whichever you like|whatever|whatever you like|whatever you think|whatever you want|surprise me|doesn't matter|does not matter|it doesn't matter|i don't mind|i dont mind|i don't care|no preference|pick 1|pick for me|choose for me|you pick for me)$/;
const ORDINALS = [
  /^(?:the )?(?:first|1st|number 1|option 1|1)(?: 1| option)?$/,
  /^(?:the )?(?:second|2nd|number 2|option 2|2)(?: 1| option)?$/,
  /^(?:the )?(?:third|3rd|number 3|option 3|3)(?: 1| option)?$/,
  /^(?:the )?(?:fourth|4th|number 4|option 4|4)(?: 1| option)?$/,
];

const LABEL_LEAD = /^(?:(?:show|see|let me see|i want to see|i'd like to see|can i see|go with|i'll go with|i'll take|take|do|i choose|i pick|pick|choose)(?: me| us)? )?(?:the )?/;
const labelForm = (text) => words(text).replace(LABEL_LEAD, '').replace(/ (?:1|view|version|please)$/, '');

/** "enclosed" | "opened" when the words ask for that view of the part ("show me that enclosed"), else null. */
export function matchShowView(text) {
  const s = words(text);
  if (!s || s.length > 80) return null;
  if (SHOW_ENCLOSED.test(s)) return 'enclosed';
  if (SHOW_OPENED.test(s)) return 'opened';
  return null;
}

/**
 * The answer to a tour decision: a choice id, or null when the words are something else (a
 * question about the part goes to Jarvis, and the tour stays at the decision). The local plan's
 * choices (enclosed / opened / both / pick) have their own words; any choice also answers to its
 * label, its `words` and its place ("the first one"). "You pick" takes the `pick` choice, else the
 * default.
 */
export function choiceReply(text, choices, { defaultId = null } = {}) {
  const list = Array.isArray(choices) ? choices.filter((c) => isObj(c) && typeof c.id === 'string') : [];
  if (!list.length) return null;
  const s = words(text);
  if (!s || s.length > 80) return null;
  const has = (id) => (list.some((c) => c.id === id) ? id : null);
  // A choice's own label or words, said whole (with "show me", "the", "go with" before it).
  const said = labelForm(text);
  for (const c of list) if (said && [c.label, ...(Array.isArray(c.words) ? c.words : [])].some((w) => labelForm(w) === said)) return c.id;
  if (BOTH.test(s) && has('both')) return 'both';
  if (PICK.test(s)) return has('pick') || (list.some((c) => c.id === defaultId) ? defaultId : list[0].id);
  if (ENCLOSED_RE.test(s) && has('enclosed')) return 'enclosed';
  if (OPENED_RE.test(s) && has('opened')) return 'opened';
  for (const [i, re] of ORDINALS.entries()) if (re.test(s) && list[i]) return list[i].id;
  if (/^(?:the )?last(?: 1| option)?$/.test(s)) return list[list.length - 1].id;
  return null;
}

/**
 * A tour word, said or typed while a tour runs (whole sentences only), or null:
 *   { action: 'tour-next' | 'tour-back' | 'tour-repeat' | 'tour-pause' | 'tour-resume' | 'tour-end' }
 *   { action: 'tour-choice', choice }   an answer at a decision (choiceReply)
 *   { action: 'tour-view', view }       "show it enclosed" / "opened" away from a decision
 *   { action: 'tour-jump', partId, partName }   "skip to the fan", "take me to the battery"
 * ctx: atChoice (a decision is open: its choices and defaultId), parts ([{ id, name, aka }]),
 * stepWaits ("okay", "got it", "yes" mean next), paused ("continue" resumes), justSaid ("what?"
 * right after a step asks for it again).
 */
export function matchTourCommand(text, { atChoice = false, choices = [], defaultId = null, parts = [], stepWaits = false, paused = false, justSaid = false } = {}) {
  const raw = normalizeCommandText(text);
  if (!raw || raw.length > 120) return null;
  if (atChoice) {
    const choice = choiceReply(text, choices, { defaultId });
    if (choice) return { action: 'tour-choice', choice };
  }
  if (stepWaits && READY.test(raw)) return { action: 'tour-next' };
  if (justSaid && /^(?:what|sorry|huh|what was that)$/.test(raw)) return { action: 'tour-repeat' };
  const s = words(text);
  if (!s) return null;
  if (END.test(s)) return { action: 'tour-end' };
  if (RESUME.test(s) || (paused && GO_ON.test(s))) return { action: 'tour-resume' };
  if (NEXT.test(s)) return { action: 'tour-next' };
  if (BACK.test(s)) return { action: 'tour-back' };
  if (REPEAT.test(s)) return { action: 'tour-repeat' };
  if (PAUSE.test(s)) return { action: 'tour-pause' };
  if (!atChoice) {
    const view = matchShowView(text);
    if (view) return { action: 'tour-view', view };
  }
  const m = JUMP.exec(s);
  if (m) {
    const hit = resolvePart(m[1] || m[2], Array.isArray(parts) ? parts : []);
    if (hit && hit.score >= 0.8) return { action: 'tour-jump', partId: hit.part.id, partName: hit.part.name };
  }
  return null;
}

// "walk me through it", "walk me through the battery", "give me a tour", "show me around".
const START = /^(?:(?:walk|talk|take|run|lead|guide) (?:me|us) through|give (?:me|us) (?:a |the )?(?:tour|walkthrough|walk through|guided tour)(?: of)?|show (?:me|us) around|(?:start|begin|do) (?:a |the )?(?:tour|walkthrough|walk through|guided tour)(?: of)?|tour)(?: (.+))?$/;
const IT_WORDS = /^(?:it|this|that|this 1|that 1|them|everything|all of it|it all|the whole thing|the whole model|the hologram|this hologram|the model|this model|the object)$/;

/**
 * Words that start a tour of the hologram on screen ("walk me through it": the object tour;
 * "walk me through the battery": the part tour), or null. "Walk me through how to replace the
 * battery" is a question for Jarvis, so a part must be named plainly (score 0.8 or better).
 */
export function matchTourStart(text, { parts = [], title = '' } = {}) {
  const s = words(text);
  if (!s || s.length > 100) return null;
  const m = START.exec(s);
  if (!m) return null;
  const target = (m[1] || '').trim();
  if (!target || IT_WORDS.test(target)) return { action: 'tour-start', partId: null };
  const bare = target.replace(/^(?:the|this|that|my|your|our) /, '');
  const titleWords = new Set(words(spokenWords(title)).split(' ').filter((w) => w.length > 1));
  if (titleWords.size && bare.split(' ').every((w) => titleWords.has(w))) return { action: 'tour-start', partId: null };
  const hit = resolvePart(target, Array.isArray(parts) ? parts : []);
  if (hit && hit.score >= 0.8 && bare.split(' ').length <= 5) return { action: 'tour-start', partId: hit.part.id, partName: hit.part.name };
  return null;
}
