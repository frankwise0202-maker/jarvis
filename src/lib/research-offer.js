// "Research this" (v8.1, E3): pure (no DOM, no network). Holding something up to the camera and
// saying "research this" never spends anything by itself: Jarvis names the subject in words and
// offers three ways with their prices first (a quick answer with a web search, a research mission,
// the home base in the background); the owner picks one, or cancels.
//
//   matchResearchThis(text)        the whole sentence: null, or { where: 'offer' | 'homebase', deep }
//                                  "research this", "look this up", "find out more about this", "do some
//                                  research on this", "dig into this"; with "in the background" or "on the
//                                  home base": the home base; with "in depth" or "deep": the deep variant
//   estimateResearchCost({ route, agents, depth, homeDepth })
//                                  { usd, low, high } (quick, mission) or { max } (the home base): one
//                                  source for the card and the spoken line
//   researchSubject({ label, answer, liveSummary, resolved })
//                                  what is researched, in words (neither the agents nor the home base
//                                  can see the picture): { name, words, source } or null (look first)
//   researchOffer({ subject, homeBase, online, liveView, agents, depth, deep })
//                                  { say, choices: [{ id, label, words, dear }], outside } or { refuse }
//   matchOfferChoice(text, choices) 'quick' | 'mission' | 'homebase' | 'cancel' | null
//   researchPrompt(subject, route)  the words each way sends: a follow-up in this chat, a mission, or
//                                  the home base's job
//   LOOK_FIRST_LINE                "Let me look first: about 3¢." (no subject yet: a Look, then the offer)

import { normalizeOpticsText, theName } from './optics-commands.js';
import { formatUsd } from './optics.js';

/**
 * The prices behind the offer (README "What it costs"): a web-search answer about 6–16¢; an 8-agent
 * mission at the Balanced depth about $1–2.50, typically $1.70 (a Deep 20-agent one $7–15); the home
 * base's hard budgets per job, $1.25 quick and $3 deep (core/server/brain/tasks.mjs PROFILES).
 */
export const RESEARCH_COSTS = Object.freeze({
  quick: Object.freeze({ usd: 0.1, low: 0.06, high: 0.16 }),
  mission: Object.freeze({
    fast: Object.freeze({ lead: 0.2, agent: 0.1 }),
    balanced: Object.freeze({ lead: 0.3, agent: 0.175 }),
    deep: Object.freeze({ lead: 0.5, agent: 0.525 }),
  }),
  homebase: Object.freeze({ quick: 1.25, deep: 3 }),
});

/** The offer's answer to how many agents a mission sends (Settings → AI → Agents per wave). */
export const DEFAULT_AGENTS = 8;

export const LOOK_FIRST_LINE = 'Let me look first: about 3¢.';
export const OFFLINE_LINE = 'I can’t research while offline.';
export const OUTSIDE_TWO = 'Those two are outside the live view’s dollar an hour.';
export const OUTSIDE_ONE = 'That one is outside the live view’s dollar an hour.';
export const QUICK_TOO_DEAR = 'A quick answer would take the live view past its dollar this hour.';

// ---------------------------------------------------------------------------------------------
// The words

// "It" only after "research" (the owner's "research this / it / that"): "look it up" stays Jarvis's own
// web search, and "look into it" or "dig into it" mean whatever was just said.
const THING = '(?:this|that|these|those|this one|that one|this thing|that thing|what i(?:\'m| am) holding)';
const THING_IT = `(?:it|${THING})`;
const DEEP_WORDS = '(?:in depth|in detail|deeply|thoroughly|properly)';
const PLACE = '(?:in the background|on (?:the |my )?home ?base|on the alien ?ware)';
const HOME = '(?:(?:the|my) )?(?:home ?base|alien ?ware)';
// The verbs, each with "this" as its object ("research this", "look this up", "dig into this").
const VERB = [
  `(?:(?:do |go do )?(?:some |a little |a bit of )?(?:(deep|quick) )?research (?:on |into |about )?${THING_IT})`,
  `(?:look ${THING} up)`,
  `(?:look up ${THING})`,
  `(?:look into ${THING})`,
  `(?:find out (?:more )?about ${THING})`,
  `(?:dig (?:deeper )?into ${THING})`,
  `(?:read up on ${THING})`,
].join('|');
const RESEARCH_THIS = new RegExp(`^(?:(?:can you |could you |would you |please |let's |lets |i want you to |go ahead and )?)(?:${VERB})(?: (${DEEP_WORDS}))?(?: (${PLACE}))?(?: (${DEEP_WORDS}))?$`);
const HOME_FIRST = new RegExp(`^(?:(?:have|get|ask|let) ${HOME} (?:to )?|${HOME},? )(?:${VERB})(?: (${DEEP_WORDS}))?$`);

/**
 * "Research this" and its cousins, as a whole sentence (after "Jarvis", "hey", "please"). Null for
 * anything else: "research the best laptops under $800" names its own subject (a question for
 * Jarvis), and "look it up" stays Jarvis's own web search.
 */
export function matchResearchThis(text) {
  const n = normalizeOpticsText(text);
  if (!n || n.length > 120) return null;
  let m = RESEARCH_THIS.exec(n);
  if (m) {
    const deep = m[1] === 'deep' || !!m[2] || !!m[4];
    return { where: m[3] ? 'homebase' : 'offer', deep };
  }
  m = HOME_FIRST.exec(n);
  if (m) return { where: 'homebase', deep: m[1] === 'deep' || !!m[2] };
  return null;
}

// ---------------------------------------------------------------------------------------------
// The price of each way

const round05 = (v) => Math.round(v * 20) / 20;

/**
 * About what each way costs:
 *   quick     a follow-up in this chat with a web search: { usd: 0.10, low: 0.06, high: 0.16 }
 *   mission   the lead plus each agent at the depth: 8 agents at Balanced about $1.70 ($1–2.55)
 *   homebase  the home base's own hard budget per job: { max: 1.25 }, or { max: 3 } in depth
 */
export function estimateResearchCost({ route, agents = DEFAULT_AGENTS, depth = 'balanced', homeDepth = 'quick' } = {}) {
  if (route === 'quick') return { ...RESEARCH_COSTS.quick };
  if (route === 'mission') {
    const p = RESEARCH_COSTS.mission[depth] || RESEARCH_COSTS.mission.balanced;
    const n = Math.min(20, Math.max(1, Math.round(Number(agents) || DEFAULT_AGENTS)));
    const usd = round05(p.lead + n * p.agent);
    return { usd, low: round05(usd * 0.6), high: round05(usd * 1.5), agents: n };
  }
  if (route === 'homebase') return { max: homeDepth === 'deep' ? RESEARCH_COSTS.homebase.deep : RESEARCH_COSTS.homebase.quick };
  return { usd: 0 };
}

/** "$1.25", "$3", "10¢": as spoken and on the chips. */
function money(usd) {
  if (usd >= 1 && Number.isInteger(usd)) return `$${usd}`;
  return formatUsd(usd);
}

// ---------------------------------------------------------------------------------------------
// The subject, in words

const clean = (s, max) => {
  const t = String(s ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]+/g, ' ')
    .replace(/[*_`#>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** The first sentence of an answer (Markdown stripped), at most 200 characters. */
export function firstSentence(text) {
  const plain = clean(String(text ?? '').split(/\n\s*\n/)[0], 400);
  const s = plain.split(/(?<=[.!?])\s/)[0] || plain;
  return clean(s, 200);
}

/**
 * What "this" is, in words, best first:
 *   - the open Look's tapped label, else its first label, with the answer's first sentence
 *     ({ name: 'USB-C charger', words: 'USB-C charger (A 65-watt USB-C charger from …)' });
 *   - else the answer's first sentence; else the live view's summary of the scene;
 *   - else what `resolved` names (resolveThis outside Optics: a hologram's title, the last question);
 *   - else null: Jarvis takes a Look first ("Let me look first: about 3¢.").
 */
export function researchSubject({ label = '', answer = '', liveSummary = '', resolved = null } = {}) {
  const name = clean(label, 60);
  const first = firstSentence(answer);
  if (name) return { name, words: first ? `${name} (${first.replace(/[.!?]+$/, '')})` : name, source: 'look' };
  if (first) return { name: '', words: first, source: 'look' };
  const scene = clean(liveSummary, 200);
  if (scene) return { name: '', words: scene, source: 'live' };
  const r = resolved && typeof resolved === 'object' ? resolved : null;
  const said = r && r.kind !== 'none' ? clean(r.words, 200) : '';
  if (said) return { name: r.kind === 'hologram' ? said : '', words: said, source: r.kind || 'this' };
  return null;
}

/** "this 65-watt USB-C charger" (a label), else “the words”, as the offer's question names it. */
function spokenSubject(subject) {
  if (subject.name) {
    const the = theName(subject.name);
    return the ? the.replace(/^the /, 'this ') : 'this';
  }
  return `“${clean(subject.words, 80)}”`;
}

// ---------------------------------------------------------------------------------------------
// The offer

/**
 * The offer Jarvis makes (an api.question() in Voice Mode, a card in Optics), prices first:
 *   "Research this 65-watt USB-C charger? A quick answer with a web search, about 10¢. A research
 *    mission with 8 agents, about $1.70. Or the home base can do it in the background, up to $1.25."
 * `homeBase`: linked (no home base: two choices). `online` false: { refuse: OFFLINE_LINE }.
 * `liveView`: { on, quickFits }: with the live view on, the quick answer counts toward its dollar
 * (it goes through the gate) and the other two don't, which the offer says; when a quick answer
 * wouldn't fit, the offer says so instead of offering it. `deep`: the home base's deep job.
 * `only`: 'homebase' ("research this in the background"): just that way.
 * Returns { say, choices: [{ id, label, words, dear }], costs } (dear: through the 2-second check).
 */
export function researchOffer({ subject, homeBase = false, online = true, liveView = null, agents = DEFAULT_AGENTS, depth = 'balanced', deep = false, only = null } = {}) {
  if (!online) return { refuse: OFFLINE_LINE };
  if (!subject || !subject.words) return { refuse: LOOK_FIRST_LINE, lookFirst: true };
  const live = !!(liveView && liveView.on);
  const quickFits = !live || liveView.quickFits !== false;
  const homeDepth = deep ? 'deep' : 'quick';
  const costs = {
    quick: estimateResearchCost({ route: 'quick' }),
    mission: estimateResearchCost({ route: 'mission', agents, depth }),
    homebase: estimateResearchCost({ route: 'homebase', homeDepth }),
  };
  const n = costs.mission.agents;
  const lines = [`Research ${spokenSubject(subject)}?`];
  const choices = [];
  const wantHome = !!homeBase && (only === null || only === 'homebase');
  if (only === 'homebase' && !homeBase) return { refuse: 'Link your home base first: Settings → Home base.' };
  if (only !== 'homebase') {
    if (quickFits) {
      lines.push(`A quick answer with a web search, about ${money(costs.quick.usd)}.`);
      choices.push({ id: 'quick', label: `Quick · about ${money(costs.quick.usd)}`, words: ['quick', 'quick answer', 'a quick answer', 'the quick answer', 'the quick one', 'quick one', 'quickly'], dear: false });
    } else lines.push(QUICK_TOO_DEAR);
    lines.push(`${wantHome || !quickFits ? 'A' : 'Or a'} research mission with ${n} agent${n === 1 ? '' : 's'}, about ${money(costs.mission.usd)}.`);
    choices.push({ id: 'mission', label: `Mission · about ${money(costs.mission.usd)}`, words: ['mission', 'a mission', 'the mission', 'research mission', 'a research mission', 'the research mission', 'swarm', 'agents', 'send the agents'], dear: true });
  }
  if (wantHome) {
    const max = money(costs.homebase.max);
    lines.push(only === 'homebase' ? `The home base can do it in the background${deep ? ', in depth' : ''}, up to ${max}.` : `Or the home base can do it in the background${deep ? ', in depth' : ''}, up to ${max}.`);
    choices.push({ id: 'homebase', label: `Home base · up to ${max}`, words: ['home base', 'the home base', 'homebase', 'in the background', 'background', 'the background', 'on the home base'], dear: true });
  }
  const outside = choices.filter((c) => c.id !== 'quick').length;
  if (live && outside) lines.push(outside > 1 ? OUTSIDE_TWO : OUTSIDE_ONE);
  choices.push({ id: 'cancel', label: 'Cancel', words: ['cancel', 'no', 'no thanks', 'no thank you', 'never mind', 'nevermind', 'forget it', 'none', 'neither', 'not now'], dear: false });
  return { say: lines.join(' '), choices, costs, subject };
}

/**
 * The owner's answer to the offer, as a whole sentence after fillers ("okay", "let's do", "go with
 * the", "please"): the choice's id, or null (not an answer: routed as usual).
 */
export function matchOfferChoice(text, choices) {
  let n = normalizeOpticsText(text);
  if (!n || !Array.isArray(choices)) return null;
  for (let i = 0; i < 3; i++) {
    n = n
      .replace(/^(?:ok|okay|yes|yeah|sure|alright|all right|um|uh|so|well)\s+/, '')
      .replace(/^(?:let's|lets|let us|i'll|ill|i will|i'd like|id like|i want|go with|go for|pick|choose|do|use|make it|take)\s+/, '')
      .replace(/^(?:go with|go for|do)\s+/, '')
      .replace(/\s+(?:please|thanks|thank you|then)$/, '')
      .trim();
  }
  for (const c of choices) {
    if (!c || !Array.isArray(c.words)) continue;
    if (c.words.some((w) => normalizeOpticsText(w) === n)) return c.id;
  }
  return null;
}

/**
 * The words each way sends (only words: the agents and the home base can't see the picture; the
 * quick answer is a follow-up in this chat, which can).
 */
export function researchPrompt(subject, route) {
  const words = clean(subject && subject.words, 300).replace(/[.!?]+$/, '') || 'this';
  if (route === 'quick') return `Research this with a web search and give me a quick answer: ${words}.`;
  if (route === 'mission') return `Research ${words}: what it is, its specifications, prices and reviews, and anything to watch out for.`;
  return `${words}: what it is, its specifications, prices and reviews, and anything to watch out for`;
}
