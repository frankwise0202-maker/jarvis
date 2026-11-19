// Protocols & briefings (SPEC §14.2): one-tap mission presets plus owner-defined protocols.
//
//   PROTOCOLS                              built-in protocols (frozen)
//   listProtocols()                        built-ins, then the owner's custom protocols
//   getProtocol(id)                        one protocol or null
//   saveCustomProtocol({ id?, name, prompt, mode, icon? })
//                                          -> { ok: true, protocol, persisted } | { ok: false, errors }
//   deleteCustomProtocol(id)               -> boolean
//   exportCustomProtocols()                -> plain copies of the custom protocols (for backups)
//   importCustomProtocols(list)            -> number added or updated (merge by id; newer wins)
//   validateCustomProtocol(input)          -> { ok, value, errors }   (pure; used by the editor)
//   onProtocolsChange(fn)                  -> unsubscribe; fn() after any custom-protocol change (any tab)
//   parseProtocolPrompt(text)              -> { headline, name, brief } | null
//   createProtocolBubble(text)             -> Element | null   (compact chat-bubble content for a protocol run)
//   createFollowupChips({ onPick })        -> { el, set(questions), setLoading(on), clear() }   (SPEC §14.5 chips)
//   createProtocolGrid({ getSettings, onRun, compact })   -> { el, refresh(), destroy() }
//   createProtocolEditor({ onSaved, onCancel, protocol? }) -> { el, focus(), isDirty() }
//   openProtocolEditor({ protocol?, onSaved, onDeleted, onClose, returnFocus }) -> { el, close() }
//
// A protocol prompt is sent as an ordinary owner message, so it starts with a short headline
// (it becomes the conversation title), then a "Protocol: <name>" line and the brief. The lead
// already receives time, name, location, mode, agent limits and memory in <turn_context>; the
// briefs restate what matters for the mission so they read well even without it.
//
// Custom protocols live in localStorage['jarvis.protocols.v1'] as
// [{ id, name, prompt, mode, icon, createdAt, updatedAt }]. Every storage access is wrapped in
// try/catch; when storage is unavailable or full, changes are kept in memory for the session.
// No innerHTML anywhere: all text goes through h()/textContent.

import { h, clear } from './dom.js';
import { icon } from './icons.js';

export const PROTOCOLS_STORAGE_KEY = 'jarvis.protocols.v1';

export const CUSTOM_PROTOCOL_LIMITS = Object.freeze({ nameMax: 40, promptMin: 10, promptMax: 4000, inputMax: 600, count: 24 });

/** Icons the owner can choose for a custom protocol (all exist in icons.js). */
export const CUSTOM_PROTOCOL_ICONS = Object.freeze(['bolt', 'sparkle', 'target', 'bulb', 'globe', 'pin', 'layers', 'search', 'agents', 'chip', 'dollar', 'memory']);
const ICON_LABELS = Object.freeze({
  bolt: 'Lightning bolt',
  sparkle: 'Sparkle',
  target: 'Target',
  bulb: 'Light bulb',
  globe: 'Globe',
  pin: 'Map pin',
  layers: 'Layers',
  search: 'Magnifier',
  agents: 'Team',
  chip: 'Chip',
  dollar: 'Dollar',
  memory: 'Bookmark',
});

const MODE_IDS = ['auto', 'quick', 'swarm'];
const MODE_META = Object.freeze({
  auto: Object.freeze({ label: 'Auto', icon: 'sparkle', hint: 'Jarvis decides: answer, search or deploy agents.' }),
  quick: Object.freeze({ label: 'Quick', icon: 'bolt', hint: 'A direct answer from Jarvis, no agents.' }),
  swarm: Object.freeze({ label: 'Swarm', icon: 'agents', hint: 'Deploys the agent team on every run.' }),
});

const INPUT_TOKEN = /\{\s*input\s*\}/i;
const INPUT_TOKEN_ALL = /\{\s*input\s*\}/gi;

// ---------------------------------------------------------------------------------------------
// Text helpers

// C0/C1 controls (except tab/newline where allowed) and invisible bidi overrides.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

function cutPoints(s, max) {
  if (s.length <= max) return s;
  const points = Array.from(s);
  return points.length <= max ? s : points.slice(0, max).join('').trimEnd();
}

/** One clean line: no control characters, whitespace collapsed, trimmed, at most `max` code points. */
function oneLine(value, max = 0) {
  if (typeof value !== 'string') return '';
  const s = value.replace(CONTROL_RE, ' ').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return max > 0 ? cutPoints(s, max) : s;
}

/** Multi-line text: normalized newlines, no control characters, at most one blank line in a row. */
function multiLine(value, max = 0) {
  if (typeof value !== 'string') return '';
  const s = value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_RE, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return max > 0 ? cutPoints(s, max) : s;
}

function ellipsize(s, max) {
  const points = Array.from(s);
  return points.length <= max ? s : points.slice(0, Math.max(1, max - 1)).join('').trimEnd() + '…';
}

/** The owner's input for a protocol: one line, at most 600 characters, outer quotes removed. */
function cleanInput(value) {
  let s = oneLine(typeof value === 'string' ? value : value == null ? '' : String(value), CUSTOM_PROTOCOL_LIMITS.inputMax);
  const quoted = /^(["'“‘«])([\s\S]*)(["'”’»])$/.exec(s);
  if (quoted && quoted[2].trim()) s = quoted[2].trim();
  return s;
}

function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toDate(now) {
  const d = now instanceof Date ? now : now === undefined || now === null ? new Date() : new Date(now);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatDate(date, opts) {
  try {
    return new Intl.DateTimeFormat('en-GB', opts).format(date);
  } catch {
    return date.toDateString();
  }
}

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/** Everything a prompt builder needs, with SPEC defaults for any missing settings key. */
function promptContext({ input, settings, now } = {}) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const date = toDate(now);
  const hour = date.getHours();
  const userName = oneLine(s.userName, 40);
  return {
    input: cleanInput(input),
    name: userName || 'sir',
    location: oneLine(s.location, 120),
    maxAgents: clampInt(s.maxAgents, 1, 20, 8),
    maxWaves: clampInt(s.maxWaves, 1, 4, 3),
    day: formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }), // Thursday 19 November
    fullDate: formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    dayMonth: formatDate(date, { day: 'numeric', month: 'long' }), // 19 November
    part: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening',
    timeZone: localTimeZone(),
  };
}

const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * The team section of a brief. Respects the owner's per-wave limit: with fewer agents than
 * angles, Jarvis is told to fold the angles together rather than drop any.
 */
function teamPlan(c, angles) {
  const n = angles.length;
  const k = Math.min(n, c.maxAgents);
  const head =
    k < n
      ? `Team: deploy ${k} field ${plural(k, 'agent', 'agents')} in one wave (my per-wave limit) and fold these ${n} angles into ${plural(k, 'its task', 'their tasks')} so every angle is covered:`
      : `Team: deploy ${n} field agents in one wave, one per angle:`;
  return [head, ...angles.map((a, i) => `${i + 1}. ${a}`)].join('\n');
}

function formatSection(lines) {
  return ['Format:', ...lines.filter(Boolean).map((l) => `- ${l}`)].join('\n');
}

function assemble(headline, name, sections) {
  return [headline, '', `Protocol: ${name}`, sections.filter(Boolean).join('\n\n')].join('\n');
}

const SPOKEN = 'in one or two sentences that read well aloud (plain words, no links, no Markdown)';

function followUpWave(c) {
  return c.maxWaves >= 2 ? ' If the reports leave a critical gap or contradiction, send one small, targeted follow-up wave.' : '';
}

function homeCountry(c) {
  // A device set to UTC says nothing about where the owner lives.
  const tz = /^(UTC|GMT|Etc\/|Universal|Zulu)/i.test(c.timeZone) ? '' : c.timeZone;
  return tz ? `my country (work it out from my time zone, ${tz})` : 'my country (infer it from my context; if unclear, use the major English-language outlets)';
}

// ---------------------------------------------------------------------------------------------
// Built-in protocols

const BRIEFING = {
  morning: { title: 'Morning briefing', greeting: 'Good morning', report: 'morning report', since: 'since yesterday evening', weather: "today's forecast", markets: 'overnight moves, futures and what is on the calendar today', watch: 'today', listen: 'over coffee' },
  afternoon: { title: 'Afternoon briefing', greeting: 'Good afternoon', report: 'afternoon report', since: 'in the last 24 hours', weather: 'the forecast for the rest of today and tonight', markets: 'how markets are trading today and why', watch: 'for the rest of today', listen: 'on the move' },
  evening: { title: 'Evening briefing', greeting: 'Good evening', report: 'evening report', since: 'in the last 24 hours', weather: "tonight's and tomorrow's forecast", markets: 'how markets closed today and what is moving after hours', watch: 'tomorrow', listen: 'over dinner' },
};

function morningBriefing(args) {
  const c = promptContext(args);
  const p = BRIEFING[c.part];
  const where = c.location;
  const angles = [];
  if (where) {
    angles.push(`Weather — ${p.weather} for ${where}: conditions, high and low, chance of rain, wind, sunrise and sunset, and any warnings or travel disruption.`);
    angles.push(`Local and national — the 3 stories that matter most for ${where} and the wider country, plus anything that affects my day (transport, strikes, closures).`);
  } else {
    angles.push(`National — the 3 most important stories in ${homeCountry(c)}.`);
  }
  angles.push(`World — the 4 most important international stories ${p.since}, each with one line on why it matters.`);
  angles.push(`Technology — the 3 most significant tech and AI developments ${p.since}: launches, deals, regulation, security incidents.`);
  angles.push(`Markets — ${p.markets}: the major stock indices (including my country's main index), benchmark bond yields, oil, gold, the dollar and bitcoin, with % moves and as-of times, plus the one story moving markets.`);
  angles.push(`One fascinating thing — a single delightful, verifiable item: a scientific discovery, space event or remarkable story from the past week, or an anniversary that falls on ${c.dayMonth}.`);
  const room = angles.length < c.maxAgents;

  const intro = where
    ? `Brief me like a crisp butler's ${p.report}: everything I need to know, nothing I don't. Today is ${c.fullDate}, and I'm in ${where}.`
    : `Brief me like a crisp butler's ${p.report}: everything I need to know, nothing I don't. Today is ${c.fullDate}. I haven't shared my location, so cover national and world news only and skip the weather.`;
  const orders =
    `The news angles stick to ${p.since}. Ask every agent for figures with as-of times and cited sources. ` +
    (room
      ? 'If my remembered facts mention specific interests (teams, companies, topics, places), add one more agent for the latest on them.'
      : 'If my remembered facts mention specific interests (teams, companies, topics, places), fold them into the relevant agents.');
  const sections = [...(where ? ['Weather'] : []), 'Headlines', 'Technology', 'Markets', 'Your interests (only if covered)', 'One fascinating thing'];
  const format = formatSection([
    `First paragraph: one or two sentences I can listen to ${p.listen}. Open with "${p.greeting}, ${c.name}." then the essentials (${where ? 'the weather, the biggest story, the market mood' : 'the biggest story and the market mood'}). No links or Markdown.`,
    `Then short sections in this order: ${sections.join(' · ')}. Two to four tight bullets each, the key fact in bold, an inline source link on each.`,
    where ? '' : 'After the sections, add one short line saying that local weather needs my location, which I can add in Settings → Location.',
    `Close with one sentence, spoken style, on the single thing worth watching ${p.watch}, then a short Sources list.`,
    'Under 450 words. Crisp, warm, no filler.',
  ]);
  return assemble(`${p.title} — ${c.day}`, 'Morning Briefing', [intro, `${teamPlan(c, angles)}\n${orders}`, format]);
}

function deepResearch(args) {
  const c = promptContext(args);
  if (!c.input) return '';
  const angles = [
    'Foundations — what it is, how it works, and the key history and milestones.',
    'State of play — the most important developments of the past 12 months, with dates.',
    'Evidence and numbers — the key data, studies and statistics, with their sources and limitations.',
    'Key players — the people, companies, institutions or countries driving it, and where each stands.',
    'Debate and risks — the strongest criticisms, unsolved problems and controversies, and the best contrarian case.',
    'Outlook — forecasts, upcoming milestones and decisions, and the signals worth watching.',
  ];
  return assemble(`Deep research: ${c.input}`, 'Deep Research', [
    `Deliverable: an authoritative briefing on "${c.input}" that I could rely on to make decisions or explain it to others: what is known, what is contested and what comes next. Today is ${c.fullDate}; prioritise the latest evidence.${c.location ? ` I'm in ${c.location}: where it matters (laws, prices, availability, local players), say what applies there.` : ''}`,
    `${teamPlan(c, angles)}\nAdapt the angles to the topic. Ask every agent for primary and authoritative sources over aggregators, and for exact figures with dates.${followUpWave(c)}`,
    formatSection([
      `First paragraph: the bottom line, ${SPOKEN}.`,
      'Then: Key findings (5–8 bullets) · Background · Where things stand · The debate · Numbers that matter (a compact table) · What to watch · Open questions.',
      'Reconcile conflicting reports and say which source you trust and why. Flag anything uncertain or dated. Cite inline and end with Sources.',
    ]),
  ]);
}

function compareDecide(args) {
  const c = promptContext(args);
  if (!c.input) return '';
  const total = Math.min(7, c.maxAgents);
  const specialists = [
    'Head-to-head — expert reviews, tests and benchmarks that compare the options directly.',
    "Owners' verdict — long-term reliability, common complaints, recalls and dealbreakers from owner reports and forums.",
    `True cost — current prices and deals${c.location ? ` in ${c.location}` : ''}, running costs, resale value, warranty and support.`,
  ];
  const team = [
    `Team: deploy up to ${total} field ${plural(total, 'agent', 'agents')} in one wave${total < 7 ? ' (my per-wave limit; merge angles to fit)' : ''}: one per option (up to 4), each building a fact sheet on identical criteria (key specs or features, price, strengths, weaknesses, what changed recently), plus these specialists:`,
    ...specialists.map((a, i) => `${i + 1}. ${a}`),
  ].join('\n');
  return assemble(`Compare & decide: ${c.input}`, 'Compare & Decide', [
    `Deliverable: a clear recommendation I can act on, backed by a fair, like-for-like comparison. Identify the options in "${c.input}" and the criteria that matter most for this kind of decision, and weigh anything relevant in my remembered facts (budget, needs, preferences). Today is ${c.fullDate}: use current prices and the latest versions.${c.location ? ` I'm in ${c.location}: use local prices and availability.` : ''}`,
    team,
    formatSection([
      `First paragraph: your verdict (which to choose and the main reason), ${SPOKEN}.`,
      'Then: The verdict ("Choose … if …", one line per option) · Comparison table (criteria as rows, options as columns, at most 4 options so it reads on a phone) · Strengths and weaknesses · Dealbreakers · Cost.',
      'Say how confident you are and what would change the verdict. Cite inline and end with Sources.',
    ]),
  ]);
}

function tripPlanner(args) {
  const c = promptContext(args);
  if (!c.input) return '';
  const from = c.location ? `from ${c.location}` : `from ${homeCountry(c)}`;
  const angles = [
    `Getting there and around — the best routes ${from}, typical fares and journey times for the dates, entry or visa rules, and local transport.`,
    'Where to stay — the best neighbourhoods for this trip and 3–4 well-reviewed places at different price points, with prices for the dates.',
    'What to do — the essential sights and experiences, opening hours, what must be booked ahead, and a smart order to see them in.',
    'Food and drink — signature dishes and standout places across budgets, and which need reservations.',
    'Conditions and events — expected weather, festivals, closures, strikes or public holidays during the dates, and what to pack.',
    'Practicalities — money and tipping, safety and scams to avoid, connectivity, plugs, and a realistic daily budget.',
  ];
  return assemble(`Trip plan: ${c.input}`, 'Trip Planner', [
    `Deliverable: a polished, realistic plan for "${c.input}" that I could start booking today. I'm travelling ${from}. Today is ${c.fullDate}. If the dates are missing or vague, choose a sensible window, say why, and note seasonal trade-offs.`,
    teamPlan(c, angles),
    formatSection([
      `First paragraph: the trip at a glance, ${SPOKEN}.`,
      'Then: At a glance (a small table: dates, weather, daily budget, getting there) · Day by day (morning, afternoon, evening) · Where to stay · Eat and drink · Know before you go · Book now (a checklist of what to reserve first).',
      'Prices are estimates: give the currency and when they were checked. Cite inline and end with Sources.',
    ]),
  ]);
}

function factCheck(args) {
  const c = promptContext(args);
  if (!c.input) return '';
  const k = Math.min(4, c.maxAgents);
  return assemble(`Fact check: “${c.input}”`, 'Fact Check', [
    `Deliverable: a rigorous, fair verdict on the claim “${c.input}”. Today is ${c.fullDate}.${c.location ? ` If the claim depends on place, assume ${c.location} unless it says otherwise.` : ''}`,
    `Method: check it yourself first with web_search and web_fetch. If the claim is multi-part, contested or high-stakes, deploy up to ${k} field ${plural(k, 'agent', 'agents')}: one to trace the original source and its context, one for primary data and official records, one for reputable fact-checks and expert analysis, and one to find the strongest counter-evidence.\nRate it as one of: True, Mostly true, Mixed, Misleading, Mostly false, False, Unproven.`,
    formatSection([
      `First paragraph: the rating and the single most important reason, ${SPOKEN}.`,
      'Then: The claim (exactly what is asserted, and by whom if known) · The evidence (bullets, each with its source and date) · Context (what is missing, exaggerated or out of date) · Confidence (how sure you are and what would change the verdict).',
      'Keep verified facts apart from unverified ones and prefer primary sources. Cite inline and end with Sources.',
    ]),
  ]);
}

function explainSimply(args) {
  const c = promptContext(args);
  if (!c.input) return '';
  return assemble(`Explain simply: ${c.input}`, 'Explain Simply', [
    `Deliverable: make "${c.input}" click for a curious, smart person with no background, in about two minutes of reading. Answer directly yourself with no agents; use a quick web search only if it depends on recent developments.${c.location ? ` Use units, currency and everyday examples that suit someone in ${c.location}.` : ''}`,
    formatSection([
      `First paragraph: the whole idea, ${SPOKEN}.`,
      'Then: An everyday analogy (and where it breaks down) · How it actually works (3–5 short steps, every technical term explained the moment it appears) · A common misconception · Why it matters (one or two real-world examples).',
      'Under 350 words. Warm and clear, never condescending. End with a "Go deeper" line naming 2–3 ideas worth exploring next.',
    ]),
  ]);
}

function newsSweep(args) {
  const c = promptContext(args);
  const topic = /^(today|now|latest|top stories|headlines|news|everything)\.?$/i.test(c.input) ? '' : c.input;
  if (!topic) {
    const angles = [
      'World — the most important international stories of the last 24 hours.',
      c.location ? `Local and national — the top stories for ${c.location} and the wider country.` : `National — the top stories in ${homeCountry(c)}.`,
      'Business and economy — markets, companies, jobs and prices: what moved and why.',
      'Technology and science — the launches, research and policy that matter.',
      'Culture, sport and the unexpected — the stories people will be talking about.',
    ];
    return assemble(`News sweep: today's top stories`, 'News Sweep', [
      `Deliverable: a sharp sweep of today's news, ranked by what matters most, with why each story matters. Today is ${c.fullDate}. Everything must be dated; flag anything unconfirmed.`,
      teamPlan(c, angles),
      formatSection([
        `First paragraph: where the world stands today, ${SPOKEN}.`,
        `Then: Top stories (the 5 that matter most, ranked, one or two lines each) · ${c.location ? 'Local and national' : 'National'} · World · Business · Technology and science · Lighter side.`,
        'Note where outlets disagree. Cite inline and end with Sources.',
      ]),
    ]);
  }
  const angles = [
    'Breaking — the last 48 hours: what happened, confirmed facts only.',
    'The week — the key developments of the past 7 days, as a dated timeline.',
    'Reactions — what officials, experts, companies and markets are saying.',
    'Perspectives — how coverage differs across outlets, regions and the political spectrum.',
    "What's next — scheduled decisions, deadlines, votes, earnings or events, and the likely scenarios.",
  ];
  return assemble(`News sweep: ${topic}`, 'News Sweep', [
    `Deliverable: everything important that has happened on "${topic}" recently, newest first, and what it means. Today is ${c.fullDate}: focus on the last 7 days, give exact dates and flag anything unconfirmed.${c.location ? ` Call out anything that specifically affects ${c.location}.` : ''}`,
    teamPlan(c, angles),
    formatSection([
      `First paragraph: where things stand, ${SPOKEN}.`,
      "Then: The big picture · Latest (dated bullets, newest first) · Why it matters · Different takes · What's next.",
      'Note where stories conflict. Cite inline and end with Sources.',
    ]),
  ]);
}

function giftFinder(args) {
  const c = promptContext(args);
  if (!c.input) return '';
  const angles = [
    'Best reviewed — top-rated products that match their interests, within budget.',
    'Unique finds — independent makers, personalised or handcrafted pieces, small brands.',
    'Experiences — classes, events, tickets or subscriptions they would love.',
    "Clever and practical — upgrades to things they use every day but wouldn't buy for themselves.",
    'Last-minute — great options that arrive within two days or can be delivered instantly.',
  ];
  return assemble(`Gift finder: ${c.input}`, 'Gift Finder', [
    `Deliverable: a shortlist of genuinely thoughtful gifts for this brief: "${c.input}". Work out the recipient, occasion, interests and budget (no budget given: cover three price bands). Every pick must be in stock and well reviewed. ${c.location ? `I'm in ${c.location}: use local currency and retailers that deliver here.` : `Use the currency and retailers of ${homeCountry(c)}.`} Today is ${c.fullDate}; respect anything relevant in my remembered facts.`,
    teamPlan(c, angles),
    formatSection([
      `First paragraph: the top pick and why it fits, ${SPOKEN}.`,
      'Then: Top picks (6–8 ideas, each with price, why it fits and where to buy as an inline link) · A wildcard · Experiences · What to avoid.',
      'Prices change: say when they were checked. End with Sources.',
    ]),
  ]);
}

function blueprintMission(args) {
  const c = promptContext(args);
  if (!c.input) return '';
  const angles = [
    `Anatomy and materials — the main components of "${c.input}", what each is made of and how they fit together, with real dimensions (mm) and positions where known.`,
    'How it works — the operating principle step by step: what each major part does and how energy, force, fluid or signals flow through it.',
    "How it's made — the manufacturing process from raw materials to final assembly and testing: the key steps, machines and where it is typically made.",
    'The exact model — the specification of this exact make, model, version or size: dimensions, weights, ratings, and what sets it apart from similar ones.',
  ];
  return assemble(`Blueprint: ${c.input}`, 'Blueprint', [
    `Deliverable: an accurate, labeled 3D hologram of "${c.input}" that I can rotate and take apart part by part, then a short explanation of how it works and how it's made. Model the specific object: if I named a make, model, year or size, use exactly that one.${c.location ? ` I'm in ${c.location}: where versions differ by market, use the one sold there.` : ''} Today is ${c.fullDate}.`,
    `${teamPlan(c, angles)}\nAsk every agent for exact figures (dimensions, materials, part names) with sources: the hologram is built from their findings.${followUpWave(c)}`,
    'Then call show_hologram once, built from the research: believable proportions and part positions, the big recognizable structure first, every part labeled with what it does and what it is made of, sensible groups and exploded-view offsets. Do not draw any 2D blueprint: I will ask for one if I want it.',
    formatSection([
      `First paragraph: what I'm looking at, ${SPOKEN}.`,
      "Then: How it works (4–6 short numbered steps) · How it's made (4–6 short numbered steps, raw material to final test) · Key specs (a compact table).",
      "Keep it tight: the hologram's labels and part cards carry the details. Cite inline and end with Sources.",
    ]),
  ]);
}

function builtIn(def) {
  return Object.freeze({ custom: false, inputOptional: false, ...def, examples: Object.freeze([...(def.examples || [])]) });
}

export const PROTOCOLS = Object.freeze([
  builtIn({
    id: 'morning-briefing',
    name: 'Morning Briefing',
    icon: 'clock',
    blurb: 'Weather, headlines, markets and one gem',
    mode: 'swarm',
    agents: 6,
    needsInput: false,
    inputLabel: '',
    inputPlaceholder: '',
    buildPrompt: morningBriefing,
  }),
  builtIn({
    id: 'deep-research',
    name: 'Deep Research',
    icon: 'layers',
    blurb: 'Every angle of any topic, sourced',
    mode: 'swarm',
    agents: 6,
    needsInput: true,
    inputLabel: 'Topic',
    inputPlaceholder: 'Any topic or question',
    inputHint: 'Add a topic first.',
    examples: ['Solid-state batteries', 'Long-term effects of GLP-1 drugs', 'The economics of vertical farming'],
    buildPrompt: deepResearch,
  }),
  builtIn({
    id: 'blueprint',
    name: 'Blueprint',
    icon: 'blueprint',
    blurb: 'Research it, see it as a labeled 3D hologram',
    mode: 'swarm',
    agents: 4,
    needsInput: true,
    inputLabel: 'What should I blueprint?',
    inputPlaceholder: 'e.g. a 2024 Camry Hybrid',
    inputHint: 'Say what to blueprint first.',
    examples: ['A 2024 Toyota Camry Hybrid', 'An AA alkaline battery', 'A car alternator'],
    buildPrompt: blueprintMission,
  }),
  builtIn({
    id: 'compare-decide',
    name: 'Compare & Decide',
    icon: 'target',
    blurb: 'Side by side, then a clear verdict',
    mode: 'swarm',
    agents: 6,
    needsInput: true,
    inputLabel: 'Options',
    inputPlaceholder: 'e.g. Kindle vs Kobo',
    inputHint: 'Add the options to compare first.',
    examples: ['Kindle Paperwhite vs Kobo Clara', 'Lease vs buy an EV', 'Notion vs Obsidian for notes'],
    buildPrompt: compareDecide,
  }),
  builtIn({
    id: 'trip-planner',
    name: 'Trip Planner',
    icon: 'pin',
    blurb: 'Itinerary, stays, food and logistics',
    mode: 'swarm',
    agents: 6,
    needsInput: true,
    inputLabel: 'Destination & dates',
    inputPlaceholder: 'Where, when, who',
    inputHint: 'Add a destination first.',
    examples: ['Lisbon, 4 days in spring', 'Tokyo in cherry blossom season', 'A long weekend in the Cotswolds'],
    buildPrompt: tripPlanner,
  }),
  builtIn({
    id: 'fact-check',
    name: 'Fact Check',
    icon: 'check',
    blurb: 'Trace a claim to a clear verdict',
    mode: 'auto',
    agents: 4,
    needsInput: true,
    inputLabel: 'Claim',
    inputPlaceholder: 'Paste a claim',
    inputHint: 'Paste the claim to check first.',
    examples: ['Humans only use 10% of their brains', 'The Great Wall is visible from space'],
    buildPrompt: factCheck,
  }),
  builtIn({
    id: 'explain-simply',
    name: 'Explain Simply',
    icon: 'bulb',
    blurb: 'Any idea, made clear in two minutes',
    mode: 'quick',
    agents: 0,
    needsInput: true,
    inputLabel: 'Topic',
    inputPlaceholder: 'Any idea or concept',
    inputHint: 'Add something to explain first.',
    examples: ['Quantum entanglement', 'How interest rates fight inflation', 'Transformers in AI'],
    buildPrompt: explainSimply,
  }),
  builtIn({
    id: 'news-sweep',
    name: 'News Sweep',
    icon: 'globe',
    blurb: "What happened, why it matters, what's next",
    mode: 'swarm',
    agents: 5,
    needsInput: true,
    inputOptional: true,
    inputLabel: 'Topic · optional',
    inputPlaceholder: 'Leave empty for today',
    examples: ['Today', 'The AI chip race', 'Climate policy'],
    buildPrompt: newsSweep,
  }),
  builtIn({
    id: 'gift-finder',
    name: 'Gift Finder',
    icon: 'sparkle',
    blurb: 'Thoughtful ideas that fit the budget',
    mode: 'swarm',
    agents: 5,
    needsInput: true,
    inputLabel: 'Who & budget',
    inputPlaceholder: 'Who, occasion, budget',
    inputHint: 'Say who the gift is for first.',
    examples: ['My sister, 30, loves hiking, under $80', 'A thank-you for a colleague, about $40'],
    buildPrompt: giftFinder,
  }),
]);

const BUILT_IN_IDS = new Set(PROTOCOLS.map((p) => p.id));

// ---------------------------------------------------------------------------------------------
// Custom protocol storage (localStorage with an in-memory fallback)

let overlay; // undefined, or the newest list that could not be persisted (kept for this session)
let lastPersisted = true;
const listeners = new Set();
let watchingStorage = false;

function getStore() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null; // SecurityError when site data is blocked
  }
}

function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = oneLine(raw.id, 64);
  const name = oneLine(raw.name, CUSTOM_PROTOCOL_LIMITS.nameMax);
  const prompt = multiLine(raw.prompt, CUSTOM_PROTOCOL_LIMITS.promptMax);
  if (!id || BUILT_IN_IDS.has(id) || !name || !prompt) return null;
  const mode = MODE_IDS.includes(raw.mode) ? raw.mode : 'auto';
  const iconName = CUSTOM_PROTOCOL_ICONS.includes(raw.icon) ? raw.icon : 'bolt';
  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : 0;
  const updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  return { id, name, prompt, mode, icon: iconName, createdAt, updatedAt };
}

function readItems() {
  let parsed = overlay;
  if (parsed === undefined) {
    const store = getStore();
    let text = null;
    if (store) {
      try {
        text = store.getItem(PROTOCOLS_STORAGE_KEY);
      } catch {
        text = null;
      }
    }
    try {
      parsed = text ? JSON.parse(text) : [];
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of parsed) {
    const item = sanitizeItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= CUSTOM_PROTOCOL_LIMITS.count) break;
  }
  return out;
}

function writeItems(items) {
  const json = JSON.stringify(items);
  const store = getStore();
  let ok = false;
  if (store) {
    try {
      store.setItem(PROTOCOLS_STORAGE_KEY, json);
      ok = true;
    } catch (err) {
      if (lastPersisted) warn('Could not save custom protocols to this browser; they will last for this session only.', err);
    }
  }
  overlay = ok ? undefined : JSON.parse(json);
  lastPersisted = ok;
  emitChange();
  return ok;
}

function warn(message, err) {
  try {
    console.warn(`[jarvis] ${message}`, err && err.name ? err.name : '');
  } catch {
    /* console unavailable */
  }
}

function emitChange() {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch (err) {
      try {
        console.error('[jarvis] protocols listener failed:', err);
      } catch {
        /* ignore */
      }
    }
  }
}

function onStorageEvent(event) {
  if (!event || (event.key !== null && event.key !== PROTOCOLS_STORAGE_KEY)) return;
  overlay = undefined; // another tab persisted a newer list
  emitChange();
}

/** fn() after any change to custom protocols, including changes made in another tab. Returns unsubscribe. */
export function onProtocolsChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  if (!watchingStorage && typeof globalThis.addEventListener === 'function') {
    watchingStorage = true;
    try {
      globalThis.addEventListener('storage', onStorageEvent);
    } catch {
      /* not a window */
    }
  }
  return () => {
    listeners.delete(fn);
  };
}

function newCustomId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return `custom-${globalThis.crypto.randomUUID().slice(0, 18)}`;
  } catch {
    /* insecure context */
  }
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function blurbOf(prompt) {
  return ellipsize(oneLine(prompt), 90);
}

function buildCustomPrompt(item, { input } = {}) {
  const needsInput = INPUT_TOKEN.test(item.prompt);
  const text = cleanInput(input);
  if (needsInput && !text) return '';
  const body = needsInput ? item.prompt.replace(INPUT_TOKEN_ALL, () => text) : item.prompt;
  return assemble(needsInput ? `${item.name}: ${text}` : item.name, item.name, [body]);
}

function toProtocol(item) {
  const needsInput = INPUT_TOKEN.test(item.prompt);
  return Object.freeze({
    id: item.id,
    name: item.name,
    icon: item.icon,
    blurb: blurbOf(item.prompt),
    mode: item.mode,
    agents: 0,
    needsInput,
    inputOptional: false,
    inputLabel: needsInput ? 'Details' : '',
    inputPlaceholder: needsInput ? 'Fill in the details' : '',
    inputHint: needsInput ? 'Add the details first.' : '',
    examples: Object.freeze([]),
    custom: true,
    prompt: item.prompt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    buildPrompt: (args) => buildCustomPrompt(item, args),
  });
}

/** Built-ins followed by the owner's custom protocols (in the order they were created). */
export function listProtocols() {
  return [...PROTOCOLS, ...readItems().map(toProtocol)];
}

export function getProtocol(id) {
  if (typeof id !== 'string' || !id) return null;
  return listProtocols().find((p) => p.id === id) || null;
}

/**
 * Validate a custom protocol without saving it. `value` is the cleaned protocol.
 * errors: { name?, prompt?, form? } with short, human messages.
 */
export function validateCustomProtocol(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const rawName = typeof src.name === 'string' ? src.name : '';
  const name = oneLine(rawName);
  const prompt = multiLine(typeof src.prompt === 'string' ? src.prompt : '');
  const mode = MODE_IDS.includes(src.mode) ? src.mode : 'auto';
  const iconName = CUSTOM_PROTOCOL_ICONS.includes(src.icon) ? src.icon : 'bolt';
  const errors = {};
  if (!name) errors.name = 'Give your protocol a name.';
  else if (Array.from(name).length > CUSTOM_PROTOCOL_LIMITS.nameMax) errors.name = `Keep the name to ${CUSTOM_PROTOCOL_LIMITS.nameMax} characters.`;
  if (!prompt) errors.prompt = 'Tell Jarvis what this protocol should do.';
  else if (Array.from(prompt).length < CUSTOM_PROTOCOL_LIMITS.promptMin) errors.prompt = 'Describe the mission in a few more words.';
  else if (Array.from(prompt).length > CUSTOM_PROTOCOL_LIMITS.promptMax) errors.prompt = `Keep the brief under ${CUSTOM_PROTOCOL_LIMITS.promptMax.toLocaleString('en-US')} characters.`;
  const id = typeof src.id === 'string' ? oneLine(src.id, 64) : '';
  return { ok: Object.keys(errors).length === 0, value: { id, name, prompt, mode, icon: iconName }, errors };
}

/**
 * Create or update a custom protocol. Pass the `id` of an existing custom protocol to update it.
 * Returns { ok: true, protocol, persisted } or { ok: false, errors } (never throws).
 */
export function saveCustomProtocol(input = {}) {
  const { ok, value, errors } = validateCustomProtocol(input);
  if (!ok) return { ok: false, errors };
  const items = readItems();
  const index = value.id ? items.findIndex((it) => it.id === value.id) : -1;
  const nameKey = value.name.toLocaleLowerCase();
  if (items.some((it, i) => i !== index && it.name.toLocaleLowerCase() === nameKey)) {
    return { ok: false, errors: { name: 'You already have a protocol with this name.' } };
  }
  const now = Date.now();
  let item;
  if (index >= 0) {
    item = { ...items[index], name: value.name, prompt: value.prompt, mode: value.mode, icon: value.icon, updatedAt: now };
    items[index] = item;
  } else {
    if (items.length >= CUSTOM_PROTOCOL_LIMITS.count) {
      return { ok: false, errors: { form: `You can keep up to ${CUSTOM_PROTOCOL_LIMITS.count} custom protocols. Delete one to add another.` } };
    }
    const id = value.id && !BUILT_IN_IDS.has(value.id) ? value.id : newCustomId();
    item = { id, name: value.name, prompt: value.prompt, mode: value.mode, icon: value.icon, createdAt: now, updatedAt: now };
    items.push(item);
  }
  const persisted = writeItems(items);
  return { ok: true, protocol: toProtocol(item), persisted };
}

/** Delete a custom protocol. Built-ins cannot be deleted. Returns true if something was removed. */
export function deleteCustomProtocol(id) {
  if (typeof id !== 'string' || !id || BUILT_IN_IDS.has(id)) return false;
  const items = readItems();
  const next = items.filter((it) => it.id !== id);
  if (next.length === items.length) return false;
  writeItems(next);
  return true;
}

/** The owner's custom protocols as plain data, for backups (built-ins are never included). */
export function exportCustomProtocols() {
  return readItems().map((item) => ({ ...item }));
}

/**
 * Merge custom protocols from a backup. A new id is added; an id that exists here is replaced
 * only when the backup's copy is newer (updatedAt); an entry whose name matches a different
 * protocol here is skipped (names stay unique); invalid entries are ignored; the 24-protocol
 * limit holds. Importing the same backup twice changes nothing. Returns how many were added
 * or updated.
 */
export function importCustomProtocols(list) {
  if (!Array.isArray(list)) return 0;
  const items = readItems();
  let changed = 0;
  for (const raw of list) {
    const item = sanitizeItem(raw);
    if (!item) continue;
    const index = items.findIndex((it) => it.id === item.id);
    const nameKey = item.name.toLocaleLowerCase();
    if (items.some((it, i) => i !== index && it.name.toLocaleLowerCase() === nameKey)) continue;
    if (index >= 0) {
      if (!(item.updatedAt > items[index].updatedAt)) continue;
      items[index] = item;
    } else {
      if (items.length >= CUSTOM_PROTOCOL_LIMITS.count) continue;
      items.push(item);
    }
    changed++;
  }
  if (changed) writeItems(items);
  return changed;
}

/**
 * Split a protocol prompt (as sent by the grid) into its parts, so a chat bubble can show the
 * headline and tuck the brief behind a disclosure. Returns null for ordinary messages.
 */
export function parseProtocolPrompt(text) {
  if (typeof text !== 'string') return null;
  const m = /^([^\n]+)\n\nProtocol: ([^\n]+)\n([\s\S]+)$/.exec(text);
  return m ? { headline: m[1], name: m[2], brief: m[3] } : null;
}

// ---------------------------------------------------------------------------------------------
// UI helpers

/**
 * Chat-bubble content for a protocol prompt: a "Protocol" tag, the headline, and the full brief
 * behind a native disclosure, so a one-tap mission doesn't fill the transcript with its brief.
 * Returns null for ordinary messages (render those as plain text, as before). Text only.
 *   bubble.append(createProtocolBubble(turn.text) || turn.text)
 */
export function createProtocolBubble(text) {
  const parsed = parseProtocolPrompt(text);
  if (!parsed) return null;
  let iconName = 'bolt';
  try {
    iconName = listProtocols().find((p) => p.name === parsed.name)?.icon || 'bolt';
  } catch {
    /* storage trouble: keep the default icon */
  }
  return h(
    'div',
    { class: 'proto-bubble', attrs: { 'data-testid': 'protocol-bubble' } },
    h('span', { class: 'proto-bubble-tag' }, icon(iconName, { size: 12, strokeWidth: 2 }), h('span', { text: 'Protocol' })),
    h('span', { class: 'proto-bubble-headline', text: parsed.headline }),
    h(
      'details',
      { class: 'proto-bubble-brief' },
      h('summary', null, icon('chevron-right', { size: 14, strokeWidth: 2 }), h('span', { text: 'Mission brief' })),
      h('div', { class: 'proto-bubble-text', text: parsed.brief }),
    ),
  );
}

/**
 * Follow-up suggestion chips (SPEC §14.5) for under the latest finished Jarvis turn.
 *   const chips = createFollowupChips({ onPick: (question) => send(question) });
 *   turnEl.after(chips.el); chips.setLoading(true); chips.set(await suggestFollowups(...));
 * Each chip is a button with data-testid="followup". Picking one hides the row and calls onPick.
 * set([]) hides the row entirely, so a failed or empty suggestion leaves no trace.
 */
export function createFollowupChips({ onPick } = {}) {
  const list = h('div', { class: 'proto-fu-list' });
  const el = h(
    'div',
    { class: 'proto-fu', hidden: true, attrs: { role: 'group', 'aria-label': 'Suggested follow-ups', 'data-testid': 'followups' } },
    h('span', { class: 'proto-fu-label', attrs: { 'aria-hidden': 'true' } }, icon('sparkle', { size: 12, strokeWidth: 2 }), h('span', { text: 'Ask next' })),
    list,
  );

  function set(questions) {
    clear(list);
    el.classList.remove('is-loading');
    const items = Array.isArray(questions) ? questions.filter((q) => typeof q === 'string' && q.trim()).slice(0, 3) : [];
    items.forEach((q, i) => {
      list.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'proto-fu-chip',
            style: { '--i': i },
            attrs: { 'data-testid': 'followup' },
            on: {
              click: () => {
                el.hidden = true;
                clear(list);
                try {
                  if (typeof onPick === 'function') onPick(q);
                } catch (err) {
                  console.error('[jarvis] follow-up onPick failed:', err);
                }
              },
            },
          },
          h('span', { class: 'proto-fu-text', text: q }),
          icon('send', { size: 14, strokeWidth: 2 }),
        ),
      );
    });
    el.hidden = items.length === 0;
  }

  function setLoading(on) {
    if (!on) {
      if (el.classList.contains('is-loading')) set([]);
      return;
    }
    clear(list);
    el.classList.add('is-loading');
    el.hidden = false;
    for (let i = 0; i < 3; i++) list.appendChild(h('span', { class: 'proto-fu-skel', style: { '--i': i }, attrs: { 'aria-hidden': 'true' } }));
  }

  return { el, set, setLoading, clear: () => set([]) };
}

let idCounter = 0;
const nextId = (prefix) => `${prefix}-${++idCounter}`;

function reducedMotion() {
  try {
    return !!globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function modeBadge(mode, id) {
  const meta = MODE_META[mode] || MODE_META.auto;
  return h('span', { class: ['proto-mode', `proto-mode--${mode}`], id }, icon(meta.icon, { size: 12, strokeWidth: 2 }), h('span', { text: meta.label }));
}

/** A terse "what will happen" line for the input row (the tile already shows the mode). */
function metaLine(p, settings) {
  if (p.mode === 'swarm') {
    const n = Math.min(p.agents, clampInt(settings?.maxAgents, 1, 20, 8));
    return p.agents > 0 ? `~${n} ${plural(n, 'agent', 'agents')}` : 'Agent team';
  }
  return p.mode === 'quick' ? 'Direct answer' : 'Jarvis decides';
}

function focusables(root) {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll(sel)).filter((el) => !el.hidden && el.getClientRects().length > 0);
}

/**
 * A roving-tabindex radio group (arrow keys move and select, Home/End jump).
 * options: [{ value, label, icon?, ariaLabel?, testid? }]
 */
function radioGroup({ label, options, value, onChange, className, optionClass, showLabels = true }) {
  let current = value;
  const buttons = options.map((opt) =>
    h(
      'button',
      {
        type: 'button',
        class: optionClass,
        attrs: { role: 'radio', 'aria-checked': String(opt.value === current), 'aria-label': opt.ariaLabel || null, 'data-testid': opt.testid || null },
        dataset: { value: opt.value },
        tabIndex: opt.value === current ? 0 : -1,
        on: { click: () => select(opt.value, true) },
      },
      opt.icon ? icon(opt.icon, { size: showLabels ? 16 : 20 }) : null,
      showLabels ? h('span', { text: opt.label }) : null,
    ),
  );
  const el = h('div', { class: className, attrs: { role: 'radiogroup', 'aria-label': label }, on: { keydown: onKey } }, buttons);

  function select(v, notify, focus = false) {
    current = v;
    buttons.forEach((b) => {
      const on = b.dataset.value === v;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    if (notify && typeof onChange === 'function') onChange(v);
  }

  function onKey(e) {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = Math.max(0, options.findIndex((o) => o.value === current));
    let j = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = options.length - 1;
    select(options[j].value, true, true);
  }

  return { el, set: (v) => select(v, false), get: () => current };
}

// ---------------------------------------------------------------------------------------------
// Grid

// Live grids, refreshed when custom protocols change. A grid that was mounted and has since been
// removed from the document is dropped (on the next change or the next grid creation), so
// re-creating the empty state for every new chat never accumulates listeners.
const grids = new Set();
let gridsSubscribed = false;

function pruneGrids() {
  for (const g of Array.from(grids)) if (g.mounted && !g.root.isConnected) g.destroy();
}

function refreshGrids() {
  for (const g of Array.from(grids)) {
    if (g.root.isConnected) {
      g.mounted = true;
      g.render();
    } else if (g.mounted) {
      g.destroy();
    }
  }
}

/**
 * The protocol grid: built-in and custom tiles, an inline input row for protocols that need
 * input, and a "New protocol" tile that opens the editor.
 *   onRun(promptText, mode, protocol) is called when the owner runs a protocol. Return false
 *   (e.g. the app's send() could not start a turn) to keep the input row open.
 * Optional extras: heading (default true) shows the "Protocols" label; sounds ({ play, haptic },
 * SPEC §14.3) adds subtle feedback; onEdit(protocol|null) replaces the built-in editor dialog.
 */
export function createProtocolGrid({ getSettings, onRun, compact = false, heading = true, sounds = null, onEdit = null, layout = 'grid' } = {}) {
  // layout 'row' (the Presence home, SPEC 2.4.4): one horizontally scrolling row of 152×92 cards
  // that snaps to each card; a protocol's input row then opens under the whole row.
  const rowLayout = layout === 'row';
  const readSettings = () => {
    try {
      const s = typeof getSettings === 'function' ? getSettings() : null;
      return s && typeof s === 'object' ? s : {};
    } catch {
      return {};
    }
  };

  const labelId = nextId('proto-label');
  const grid = h('div', { class: 'proto-grid' });
  const root = h(
    'section',
    {
      class: ['proto', compact && 'proto--compact', rowLayout && 'proto--row', 'is-entering'],
      attrs: { 'data-testid': 'protocol-grid', 'aria-labelledby': heading ? labelId : null, 'aria-label': heading ? null : 'Protocols' },
    },
    heading
      ? h(
          'div',
          { class: 'proto-head' },
          h('h2', { class: 'proto-label', id: labelId, text: 'Protocols' }),
          h('span', { class: 'proto-rule', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'proto-sub', text: 'One-tap missions' }),
        )
      : null,
    grid,
  );

  let open = null; // { protocol, row, input, tile, btn, setHint }
  let resizeObserver = null;
  const entry = { root, mounted: false, render: () => render(), destroy: () => destroy() };

  function feedback(kind) {
    try {
      if (kind === 'tap') {
        sounds?.play?.('tap');
        sounds?.haptic?.('light');
      }
    } catch {
      /* sounds are optional */
    }
  }

  function tileFor(p, index) {
    const blurbId = nextId('proto-blurb');
    const modeId = nextId('proto-mode');
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'proto-tile-btn',
        attrs: {
          'data-testid': 'protocol-tile',
          'aria-label': p.needsInput ? `${p.name}…` : p.name,
          'aria-describedby': compact ? null : `${blurbId} ${modeId}`,
          'aria-expanded': p.needsInput ? 'false' : null,
        },
        dataset: { id: p.id },
        on: { click: () => activate(p, btn) },
      },
      h('span', { class: 'proto-tile-top' }, h('span', { class: 'proto-icon' }, icon(p.icon, { size: compact ? 18 : 20 })), compact ? null : modeBadge(p.mode, modeId)),
      h('span', { class: 'proto-name', text: p.name }),
      compact ? null : h('span', { class: 'proto-blurb', id: blurbId, text: p.blurb }),
    );
    const edit = p.custom
      ? h(
          'button',
          {
            type: 'button',
            class: 'proto-edit',
            attrs: { 'aria-label': `Edit ${p.name}`, 'data-testid': 'protocol-edit', title: 'Edit or delete' },
            dataset: { id: p.id },
            on: { click: () => editProtocol(p) },
          },
          icon('edit', { size: 15 }),
        )
      : null;
    return h('div', { class: ['proto-tile', p.custom && 'is-custom', p.needsInput && 'has-input'], dataset: { id: p.id }, style: { '--i': index } }, btn, edit);
  }

  function addTile(index) {
    return h(
      'button',
      { type: 'button', class: 'proto-add', attrs: { 'data-testid': 'protocol-add' }, style: { '--i': index }, on: { click: () => editProtocol(null) } },
      h('span', { class: 'proto-add-icon' }, icon('plus', { size: 18 })),
      h('span', { class: 'proto-add-text' }, h('span', { class: 'proto-add-title', text: 'New protocol' }), compact ? null : h('span', { class: 'proto-add-sub', text: 'Save your own one-tap mission' })),
    );
  }

  function render() {
    const keep = open ? { id: open.protocol.id, value: open.input.value, focused: open.row.contains(document.activeElement) } : null;
    closeRow({ silent: true });
    clear(grid);
    const items = listProtocols();
    items.forEach((p, i) => grid.appendChild(tileFor(p, i)));
    grid.appendChild(addTile(items.length));
    if (keep) {
      const p = items.find((x) => x.id === keep.id);
      const btn = p && findTileButton(p.id);
      if (p && p.needsInput && btn) openRow(p, btn, { value: keep.value, focus: keep.focused });
    }
  }

  function findTileButton(id) {
    return Array.from(grid.querySelectorAll('.proto-tile-btn')).find((b) => b.dataset.id === id) || null;
  }

  function activate(p, btn) {
    entry.mounted = true;
    feedback('tap');
    if (!p.needsInput) {
      run(p, '');
      return;
    }
    if (open && open.protocol.id === p.id) {
      closeRow({ focusTile: true });
      return;
    }
    openRow(p, btn, { focus: true });
  }

  function openRow(p, btn, { value = '', focus = true } = {}) {
    closeRow({ silent: true });
    const tile = btn.closest('.proto-tile');
    const rowId = nextId('proto-row');
    const inputId = nextId('proto-input');
    const hintId = nextId('proto-hint');
    const settings = readSettings();
    const input = h('input', {
      type: 'text',
      id: inputId,
      class: 'proto-input',
      value,
      placeholder: p.inputPlaceholder || '',
      maxLength: CUSTOM_PROTOCOL_LIMITS.inputMax,
      autocomplete: 'off',
      spellcheck: true,
      attrs: { 'data-testid': 'protocol-input', enterkeyhint: 'go', autocapitalize: 'sentences', 'aria-describedby': hintId },
      on: { keydown: onInputKey, input: () => setHint('') },
    });
    const hint = h('p', { class: 'proto-hint', id: hintId, attrs: { 'aria-live': 'polite' } });
    const examples = p.examples && p.examples.length
      ? h(
          'div',
          { class: 'proto-examples' },
          h('span', { class: 'proto-examples-label', text: 'Try' }),
          h(
            'div',
            { class: 'proto-examples-list' },
            p.examples.map((ex) =>
              h('button', {
                type: 'button',
                class: 'proto-ex',
                text: ex,
                attrs: { 'data-testid': 'protocol-example' },
                on: {
                  click: () => {
                    input.value = ex;
                    setHint('');
                    input.focus();
                  },
                },
              }),
            ),
          ),
        )
      : null;
    const row = h(
      'div',
      { class: 'proto-row', id: rowId, attrs: { role: 'group', 'aria-label': `${p.name}: ${p.inputLabel || 'details'}` } },
      h(
        'div',
        { class: 'proto-row-head' },
        h('label', { class: 'proto-row-label', htmlFor: inputId }, icon(p.icon, { size: 14, strokeWidth: 2 }), h('span', { text: p.inputLabel || 'Details' })),
        h('span', { class: 'proto-row-meta', text: metaLine(p, settings) }),
        h(
          'button',
          { type: 'button', class: 'proto-row-close', attrs: { 'aria-label': 'Cancel', 'data-testid': 'protocol-cancel' }, on: { click: () => closeRow({ focusTile: true }) } },
          icon('close', { size: 18 }),
        ),
      ),
      h(
        'div',
        { class: 'proto-row-field' },
        input,
        h('button', { type: 'button', class: 'proto-run', attrs: { 'data-testid': 'protocol-run' }, on: { click: () => run(p, input.value) } }, icon('play', { size: 14 }), h('span', { text: 'Run' })),
      ),
      hint,
      examples,
    );

    function setHint(text) {
      hint.textContent = text;
      row.classList.toggle('has-error', !!text);
      if (text) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    function onInputKey(e) {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        run(p, input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRow({ focusTile: true });
      }
    }

    if (rowLayout) grid.after(row);
    else tile.after(row);
    tile.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', rowId);
    open = { protocol: p, row, input, tile, btn, setHint };
    placeCaret();
    watchResize();
    // Focus synchronously inside the tap handler so iOS raises the keyboard.
    if (focus) input.focus();
  }

  function placeCaret() {
    if (!open) return;
    const g = grid.getBoundingClientRect();
    const t = open.tile.getBoundingClientRect();
    if (!g.width) return;
    open.row.style.setProperty('--caret-x', `${Math.round(t.left - g.left + t.width / 2)}px`);
  }

  function watchResize() {
    if (resizeObserver || typeof ResizeObserver !== 'function') return;
    resizeObserver = new ResizeObserver(() => placeCaret());
    resizeObserver.observe(grid);
    // The row scrolls sideways: keep the caret under the open tile.
    if (rowLayout) grid.addEventListener('scroll', placeCaret, { passive: true });
  }

  function closeRow({ focusTile = false, silent = false } = {}) {
    if (!open) return;
    const { row, tile, btn } = open;
    open = null;
    row.remove();
    tile.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-controls');
    if (focusTile && !silent && btn.isConnected) btn.focus();
  }

  function run(p, value) {
    const input = cleanInput(value);
    if (p.needsInput && !p.inputOptional && !input) {
      if (open && open.protocol.id === p.id) {
        open.setHint(p.inputHint || 'Add the details first.');
        open.row.classList.remove('is-shaking');
        void open.row.offsetWidth; // restart the nudge animation
        open.row.classList.add('is-shaking');
        open.input.focus();
      }
      return;
    }
    let text = '';
    try {
      text = p.buildPrompt({ input, settings: readSettings(), now: new Date() });
    } catch (err) {
      console.error('[jarvis] protocol prompt failed:', err);
    }
    if (!text) return;
    let accepted = true;
    try {
      if (typeof onRun === 'function') accepted = onRun(text, MODE_IDS.includes(p.mode) ? p.mode : 'auto', p) !== false;
    } catch (err) {
      console.error('[jarvis] protocol onRun failed:', err);
      accepted = false;
    }
    // onRun returning false (offline, no key, busy) keeps the row open so the input isn't lost.
    if (accepted && open) {
      open.input.blur();
      closeRow({ silent: true });
    }
  }

  function editProtocol(p) {
    entry.mounted = true;
    feedback('tap');
    if (typeof onEdit === 'function') {
      onEdit(p);
      return;
    }
    openProtocolEditor({
      protocol: p,
      returnFocus: (result) => {
        // After a save the grid has re-rendered: land on the saved tile and let it glow briefly.
        const tile = result && result.id ? grid.querySelector(`.proto-tile[data-id="${cssEscape(result.id)}"]`) : null;
        if (tile) {
          tile.classList.add('is-fresh');
          setTimeout(() => tile.classList.remove('is-fresh'), 1600);
          tile.querySelector('.proto-tile-btn')?.focus();
          return;
        }
        const same = p ? grid.querySelector(`.proto-edit[data-id="${cssEscape(p.id)}"]`) : null;
        (same || grid.querySelector('.proto-add'))?.focus();
      },
    });
  }

  function destroy() {
    grids.delete(entry);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    grid.removeEventListener('scroll', placeCaret);
  }

  pruneGrids();
  grids.add(entry);
  if (!gridsSubscribed) {
    gridsSubscribed = true;
    onProtocolsChange(refreshGrids);
  }
  render();
  // Integrators mount synchronously; note it so a later removal lets this grid be released.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (root.isConnected) entry.mounted = true;
    });
  }
  // The entrance animation plays once, on first mount only.
  setTimeout(() => root.classList.remove('is-entering'), reducedMotion() ? 0 : 1200);

  return {
    el: root,
    refresh() {
      if (root.isConnected) entry.mounted = true;
      render();
    },
    destroy,
  };
}

function cssEscape(value) {
  try {
    if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') return globalThis.CSS.escape(value);
  } catch {
    /* fall through */
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------------------------
// Editor

const STARTERS = Object.freeze([
  Object.freeze({
    name: 'Weekend Planner',
    icon: 'pin',
    mode: 'swarm',
    prompt:
      'Plan a great weekend near me. Deploy 4 agents: the weather forecast, the best events and exhibitions, a standout dinner spot that can still be booked, and one outdoor idea. Give me a simple Saturday and Sunday plan with times and links.',
  }),
  Object.freeze({
    name: 'Market Wrap',
    icon: 'dollar',
    mode: 'swarm',
    prompt:
      'Give me a weekly market wrap. Deploy 4 agents: equities, rates and currencies, commodities and crypto, and the week ahead (earnings, data releases, central banks). Lead with the three moves that matter most, then a compact table of weekly % changes.',
  }),
  Object.freeze({
    name: 'Dinner Ideas',
    icon: 'bulb',
    mode: 'auto',
    prompt:
      "Suggest three dinners I can make tonight with {input}. For each: total time, difficulty, anything I'm likely missing, and short steps. Favour healthy, crowd-pleasing options.",
  }),
]);

/**
 * The custom-protocol form (name, icon, brief, mode) with inline validation.
 * Pass a custom `protocol` to edit it (adds a two-step Delete). Returns { el, focus(), isDirty() }.
 *   onSaved(protocol, { persisted }) after a successful save (persisted is false when browser
 *   storage is unavailable: the protocol then lasts for this session only); onCancel() on Cancel/close;
 *   onDeleted(id) after a delete (falls back to onCancel when not provided).
 */
export function createProtocolEditor({ onSaved, onCancel, onDeleted, protocol = null } = {}) {
  const editing = protocol && protocol.custom ? protocol : null;
  const initial = {
    name: editing ? editing.name : '',
    prompt: editing ? editing.prompt : '',
    mode: editing ? editing.mode : 'auto',
    icon: editing ? editing.icon : 'bolt',
  };
  const state = { ...initial };
  let submitted = false;
  let deleteArmed = null;

  const titleId = nextId('proto-ed-title');
  const nameId = nextId('proto-ed-name');
  const promptId = nextId('proto-ed-prompt');
  const nameErrId = nextId('proto-ed-name-err');
  const promptErrId = nextId('proto-ed-prompt-err');
  const helpId = nextId('proto-ed-help');

  const badge = h('span', { class: 'proto-ed-badge', attrs: { 'aria-hidden': 'true' } }, icon(state.icon, { size: 22 }));
  const title = h('h2', { class: 'proto-ed-title', id: titleId, tabIndex: -1, text: editing ? 'Edit protocol' : 'New protocol' });

  const nameCount = h('span', { class: 'proto-count', attrs: { 'aria-hidden': 'true' } });
  const nameInput = h('input', {
    type: 'text',
    id: nameId,
    class: 'proto-field-input',
    value: state.name,
    placeholder: 'e.g. Weekly Market Wrap',
    maxLength: CUSTOM_PROTOCOL_LIMITS.nameMax,
    autocomplete: 'off',
    attrs: { 'data-testid': 'protocol-editor-name', autocapitalize: 'words', enterkeyhint: 'next', 'aria-describedby': nameErrId },
    on: {
      input: () => update({ name: nameInput.value }),
      keydown: (e) => {
        // Enter in the name moves on to the brief (the keyboard shows "next"), rather than saving.
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          promptInput.focus();
        }
      },
    },
  });
  const nameErr = h('p', { class: 'proto-err', id: nameErrId, attrs: { 'aria-live': 'polite' } });

  const iconPicker = radioGroup({
    label: 'Icon',
    className: 'proto-icons',
    optionClass: 'proto-icon-opt',
    showLabels: false,
    value: state.icon,
    options: CUSTOM_PROTOCOL_ICONS.map((name) => ({ value: name, label: ICON_LABELS[name] || name, icon: name, ariaLabel: ICON_LABELS[name] || name, testid: 'protocol-editor-icon' })),
    onChange: (v) => update({ icon: v }),
  });

  const promptCount = h('span', { class: 'proto-count', attrs: { 'aria-hidden': 'true' } });
  const promptInput = h('textarea', {
    id: promptId,
    class: 'proto-field-input proto-textarea',
    value: state.prompt,
    rows: 6,
    maxLength: CUSTOM_PROTOCOL_LIMITS.promptMax,
    placeholder: 'Brief Jarvis like a chief of staff: the deliverable, the angles to cover, how many agents, and how you want the answer laid out.',
    attrs: { 'data-testid': 'protocol-editor-prompt', autocapitalize: 'sentences', 'aria-describedby': `${helpId} ${promptErrId}` },
    on: { input: () => update({ prompt: promptInput.value }) },
  });
  const promptErr = h('p', { class: 'proto-err', id: promptErrId, attrs: { 'aria-live': 'polite' } });
  const help = h(
    'p',
    { class: 'proto-help', id: helpId },
    'Add ',
    h('code', { class: 'proto-token', text: '{input}' }),
    ' where you want to be asked for details each time you run it.',
  );

  const modeDesc = h('p', { class: 'proto-mode-desc' });
  const modePicker = radioGroup({
    label: 'Mode',
    className: 'proto-seg',
    optionClass: 'proto-seg-opt',
    value: state.mode,
    options: MODE_IDS.map((m) => ({ value: m, label: MODE_META[m].label, icon: MODE_META[m].icon, testid: `protocol-editor-mode-${m}` })),
    onChange: (v) => update({ mode: v }),
  });

  const starters = editing
    ? null
    : h(
        'div',
        { class: 'proto-starters' },
        h('span', { class: 'proto-starters-label', text: 'Need an idea?' }),
        h(
          'div',
          { class: 'proto-starters-list' },
          STARTERS.map((s) =>
            h(
              'button',
              {
                type: 'button',
                class: 'proto-starter',
                attrs: { 'data-testid': 'protocol-starter' },
                on: {
                  click: () => {
                    nameInput.value = s.name;
                    promptInput.value = s.prompt;
                    iconPicker.set(s.icon);
                    modePicker.set(s.mode);
                    update({ name: s.name, prompt: s.prompt, icon: s.icon, mode: s.mode });
                    autoGrow();
                    promptInput.focus();
                  },
                },
              },
              icon(s.icon, { size: 14 }),
              h('span', { text: s.name }),
            ),
          ),
        ),
      );

  const formErr = h('p', { class: 'proto-form-err', attrs: { 'aria-live': 'polite', role: 'status' } });

  const deleteBtn = editing
    ? h(
        'button',
        { type: 'button', class: 'proto-btn proto-btn--danger', attrs: { 'data-testid': 'protocol-editor-delete' }, on: { click: onDelete } },
        icon('trash', { size: 16 }),
        h('span', { class: 'proto-del-label', text: 'Delete' }),
      )
    : null;

  const form = h(
    'form',
    { class: 'proto-editor', noValidate: true, attrs: { 'data-testid': 'protocol-editor', 'aria-labelledby': titleId }, on: { submit: onSubmit, keydown: onFormKey } },
    h(
      'div',
      { class: 'proto-ed-head' },
      badge,
      h('div', { class: 'proto-ed-heading' }, title, h('p', { class: 'proto-ed-sub', text: 'A one-tap mission you can run any time.' })),
      h(
        'button',
        { type: 'button', class: 'proto-ed-close', attrs: { 'aria-label': 'Close', 'data-testid': 'protocol-editor-close' }, on: { click: () => cancel() } },
        icon('close', { size: 20 }),
      ),
    ),
    h('div', { class: 'proto-field' }, h('div', { class: 'proto-field-top' }, h('label', { class: 'proto-field-label', htmlFor: nameId, text: 'Name' }), nameCount), nameInput, nameErr),
    h('div', { class: 'proto-field' }, h('div', { class: 'proto-field-top' }, h('span', { class: 'proto-field-label', text: 'Icon' })), iconPicker.el),
    h(
      'div',
      { class: 'proto-field' },
      h('div', { class: 'proto-field-top' }, h('label', { class: 'proto-field-label', htmlFor: promptId, text: 'Mission brief' }), promptCount),
      promptInput,
      help,
      promptErr,
    ),
    h('div', { class: 'proto-field' }, h('div', { class: 'proto-field-top' }, h('span', { class: 'proto-field-label', text: 'Mode' })), modePicker.el, modeDesc),
    starters,
    formErr,
    h(
      'div',
      { class: 'proto-ed-actions' },
      deleteBtn,
      h('span', { class: 'proto-ed-spacer' }),
      h('button', { type: 'button', class: 'proto-btn proto-btn--ghost', text: 'Cancel', attrs: { 'data-testid': 'protocol-editor-cancel' }, on: { click: () => cancel() } }),
      h('button', { type: 'submit', class: 'proto-btn proto-btn--primary', attrs: { 'data-testid': 'protocol-editor-save' } }, icon('check', { size: 16 }), h('span', { text: editing ? 'Save' : 'Save protocol' })),
    ),
  );

  function update(patch) {
    Object.assign(state, patch);
    if ('icon' in patch) {
      clear(badge);
      badge.appendChild(icon(state.icon, { size: 22 }));
    }
    renderCounts();
    renderMode();
    if (submitted) showErrors(validateCustomProtocol({ ...state, id: editing?.id }).errors);
    else if ('name' in patch) setError(nameInput, nameErr, '');
    else if ('prompt' in patch) setError(promptInput, promptErr, '');
    if ('prompt' in patch) autoGrow();
    formErr.textContent = '';
  }

  function renderCounts() {
    const n = Array.from(state.name.trim()).length;
    const p = Array.from(state.prompt).length;
    nameCount.textContent = `${n}/${CUSTOM_PROTOCOL_LIMITS.nameMax}`;
    promptCount.textContent = `${p.toLocaleString('en-US')}/${CUSTOM_PROTOCOL_LIMITS.promptMax.toLocaleString('en-US')}`;
    nameCount.classList.toggle('is-near', n > CUSTOM_PROTOCOL_LIMITS.nameMax - 6);
    promptCount.classList.toggle('is-near', p > CUSTOM_PROTOCOL_LIMITS.promptMax - 200);
  }

  function renderMode() {
    const asks = INPUT_TOKEN.test(state.prompt);
    modeDesc.textContent = `${MODE_META[state.mode].hint}${asks ? ' Asks you for details each run.' : ''}`;
  }

  function setError(field, el, message) {
    el.textContent = message || '';
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }

  function showErrors(errors) {
    setError(nameInput, nameErr, errors.name);
    setError(promptInput, promptErr, errors.prompt);
    formErr.textContent = errors.form || '';
  }

  function autoGrow() {
    // Grow the brief with its content (6–14 lines), keeping the dialog scrollable beyond that.
    promptInput.style.height = 'auto';
    const max = 14 * 22 + 24;
    promptInput.style.height = `${Math.min(max, Math.max(promptInput.scrollHeight, 6 * 22 + 24))}px`;
  }

  function onSubmit(e) {
    e.preventDefault();
    submitted = true;
    const check = validateCustomProtocol({ ...state, id: editing?.id });
    if (!check.ok) {
      showErrors(check.errors);
      (check.errors.name ? nameInput : promptInput).focus();
      return;
    }
    const result = saveCustomProtocol({ ...state, id: editing?.id });
    if (!result.ok) {
      showErrors(result.errors);
      if (result.errors.name) nameInput.focus();
      return;
    }
    if (typeof onSaved === 'function') onSaved(result.protocol, { persisted: result.persisted });
  }

  function onDelete() {
    if (!editing) return;
    if (!deleteArmed) {
      deleteBtn.classList.add('is-armed');
      deleteBtn.querySelector('.proto-del-label').textContent = 'Tap again to delete';
      deleteArmed = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    deleteCustomProtocol(editing.id);
    if (typeof onDeleted === 'function') onDeleted(editing.id);
    else if (typeof onCancel === 'function') onCancel();
  }

  function disarm() {
    if (deleteArmed) clearTimeout(deleteArmed);
    deleteArmed = null;
    if (deleteBtn) {
      deleteBtn.classList.remove('is-armed');
      deleteBtn.querySelector('.proto-del-label').textContent = 'Delete';
    }
  }

  function cancel() {
    disarm();
    if (typeof onCancel === 'function') onCancel();
  }

  function onFormKey(e) {
    // Cmd/Ctrl+Enter saves from anywhere in the form (Enter alone adds a line in the brief).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : onSubmit(e);
    }
  }

  renderCounts();
  renderMode();

  return {
    el: form,
    titleId,
    focus() {
      if (editing) title.focus();
      else nameInput.focus();
      autoGrow();
    },
    isDirty() {
      return state.name !== initial.name || state.prompt !== initial.prompt || state.mode !== initial.mode || state.icon !== initial.icon;
    },
  };
}

/**
 * The editor in an accessible modal dialog: a bottom sheet on phones, a centred panel on wider
 * screens. Focus is trapped inside; Escape closes; a backdrop tap closes it when nothing changed.
 * returnFocus: an element, or (result) => void where result is the saved protocol or null.
 */
export function openProtocolEditor({ protocol = null, onSaved, onDeleted, onClose, returnFocus } = {}) {
  const opener = typeof document !== 'undefined' ? document.activeElement : null;
  let closed = false;
  let result = null;

  const editor = createProtocolEditor({
    protocol,
    onSaved: (p, info) => {
      result = p;
      try {
        onSaved?.(p, info);
      } finally {
        close();
      }
    },
    onDeleted: (id) => {
      try {
        onDeleted?.(id);
      } finally {
        close();
      }
    },
    onCancel: () => close(),
  });

  const panel = h('div', { class: 'proto-modal-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': editor.titleId } }, editor.el);
  const overlay = h('div', { class: 'proto-modal', attrs: { 'data-testid': 'protocol-editor-modal' } }, panel);

  let downOnBackdrop = false;
  overlay.addEventListener('pointerdown', (e) => {
    downOnBackdrop = e.target === overlay;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay || !downOnBackdrop) return;
    if (editor.isDirty()) {
      panel.classList.remove('is-nudged');
      void panel.offsetWidth;
      panel.classList.add('is-nudged');
      return;
    }
    close();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = focusables(panel);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.body.appendChild(overlay);
  const inerted = [];
  for (const child of Array.from(document.body.children)) {
    if (child === overlay || child.inert || child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
    child.inert = true;
    inerted.push(child);
  }
  editor.focus();

  function close() {
    if (closed) return;
    closed = true;
    for (const child of inerted) child.inert = false;
    overlay.remove();
    try {
      onClose?.(result);
    } catch (err) {
      console.error('[jarvis] protocol editor onClose failed:', err);
    }
    try {
      if (typeof returnFocus === 'function') returnFocus(result);
      else if (returnFocus && returnFocus.isConnected) returnFocus.focus();
      else if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    } catch {
      /* focus is best effort */
    }
  }

  return { el: overlay, close };
}
