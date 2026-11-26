// App commands (v8.1, SPEC §30): the free, local words that work the app itself, said or typed.
// Pure: no DOM, no storage, no tokens. The router (src/lib/command-router.js) asks these in its
// `stop` and `app` layers; src/ui/commands/voice.js runs what they return and says the line.
//
//   matchAppCommand(text, state)     the app's own commands, on every surface (null: not one):
//     { do: 'new-chat' }                           "new chat", "start a new chat"
//     { do: 'open', sheet: 'history' }             "open history", "show me my history"
//     { do: 'open', sheet: 'settings', section }   "open settings", "open the voice settings"
//     { do: 'open', sheet: 'library' }             "open the library", "open my blueprints",
//                                                  "show my saved holograms"
//     { do: 'open', sheet: 'mission' }             "show mission control"
//     { do: 'open', sheet: 'homebase' }            "open the home base"
//     { do: 'voice-rate', faster }                 "speak slower", "talk a bit faster", "slow down"
//     { do: 'setting', key, value }                "turn off continuous", "send right away"
//     { do: 'voice', which: 'george' | 'device' }  "use George", "use the Mac's voice"
//     { do: 'spend', period }                      "how much have I spent today" ('today' | 'month' |
//                                                  'both'), "how much has the live view cost" ('live')
//   matchVoiceControl(text, state)   Voice Mode's own controls (the router gives them Voice Mode only):
//     { do: 'hush' }                               "stop talking", "be quiet", "that's enough"
//     { do: 'read-full' }                          "read the full answer", "read me the rest"
//     { do: 'repeat' }                             "repeat that", "say that again"
//     { do: 'mic-off', mic: true }                 "stop listening"
//     { do: 'exit-voice', mic: true, undo: false } "exit Voice Mode"
//   matchScreenLook(text, state)     SHOULD C5, the `destination` layer: "look at my screen", "what's on my
//                                    screen": { do: 'screen-look', free: false, camera: true, usd? } (a
//                                    one-tap button: the screen's share picker needs a tap; a Look's price
//                                    on it: state.lookUsd, warm or cold, else LOOK_USD)
//   matchBriefing(text, state)       SHOULD C6, Voice Mode: "brief me" with no home base linked:
//                                    { do: 'brief', free: false, usd? } (the briefing protocol, its price
//                                    asked first: state.briefingUsd, else BRIEFING_USD)
//   briefingUsd({ maxAgents, depth, location })   the briefing's price at the owner's team size and depth
//   matchStopWord(text, state)       the `stop` layer: a bare "stop" stops what runs, all of it:
//     { do: 'stop', targets }                      targets ⊂ ['tour', 'answer', 'elsewhere', 'chrome',
//                                                  'watch', 'liveview', 'music', 'speech'] (pause the
//                                                  tour; stop every chat's turn in this window: an
//                                                  answer, a mission, a Look's answer; say where
//                                                  another window's runs; the Chrome task, Optics'
//                                                  Watch, the live view, a music preview, Jarvis's
//                                                  voice); [] when
//                                                  nothing runs ("Okay."). With a hologram on screen
//                                                  and nothing running: null, so the viewer's own
//                                                  "stop" (hold still) takes it (a blueprint sheet
//                                                  alone has none: "Okay.").
//   appCommandLine(action, outcome)  the one short line Jarvis says once it has acted (R9)
//   spendLine({ period, todayUsd, monthUsd, liveUsd })   "About 42 cents today." / "Nothing spent today."
//   moneyWords(usd)                  "about 42 cents", "about $3.20", "less than a cent"
//   nextVoiceRate(rate, faster)      the next speaking rate, 0.1 a step, within 0.7-1.5
//
// Every action is { do, free: true, undo: true, check: false, camera: false, mic: false, ...args }
// (contract (b)). The router takes an alternative reading only for an action that is free, undoable,
// unchecked and touches neither the camera nor the microphone (R7), so "stop listening" and "exit
// Voice Mode" act on the best reading only.
//
// Whole sentences only (R3): every pattern is anchored at both ends once the fillers are off ("hey
// Jarvis", "can you", "please", "for me"), so "open the settings app on my iPhone", "start a new
// conversation with my boss" or "stop listening to music at night" stay questions for Jarvis. The
// model and the mode stay in Settings (they change what things cost).

import { matchBrainCommand } from './brain.js';
import { estimateResearchCost } from './research-offer.js';

export const VOICE_RATE = Object.freeze({ min: 0.7, max: 1.5, step: 0.1 });
/** What a briefing written by Claude costs, typically (an 8-agent research mission: README "What it costs"). */
export const BRIEFING_USD = 1.7;
/** What a Look costs, typically (README "What it costs"). */
export const LOOK_USD = 0.03;

/**
 * MONEY-5: what the briefing protocol costs at the owner's team size and depth, as the research offer
 * prices a mission (estimateResearchCost): one agent per angle (six with a location: the weather and
 * the local news; five without), one more for the owner's interests when there is room, at most the
 * per-wave limit. About $0.90 at Fast, $1.55 at Balanced and $4.20 at Deep with 7 agents.
 */
export function briefingUsd({ maxAgents = 8, depth = 'balanced', location = '' } = {}) {
  const angles = String(location || '').trim() ? 6 : 5;
  const max = Math.min(20, Math.max(1, Math.round(Number(maxAgents) || 8)));
  return estimateResearchCost({ route: 'mission', agents: Math.min(max, angles + 1), depth }).usd;
}

/** { usd } for an action when `v` is a price (state.lookUsd, state.briefingUsd), else nothing. */
const priced = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? { usd: v } : {});

const ACTION_DEFAULTS = Object.freeze({ free: true, undo: true, check: false, camera: false, mic: false });

/** An action of contract (b) with its defaults: { do, free, undo, check, camera, mic, ...extra }. */
export function act(name, extra = {}) {
  return Object.freeze({ do: name, ...ACTION_DEFAULTS, ...extra });
}

// Said first or last, changing nothing ("Hey Jarvis, can you open settings for me, please").
const LEAD = /^(?:(?:hey|hi|ok|okay|so|um|uh|er|and|alright|all right|well|oh|yo|now)\s+)*(?:jarvis\s+)?(?:(?:hey|ok|okay|so|um|uh|now)\s+)*(?:(?:please|can you please|could you please|would you please|can you|could you|would you|will you|go ahead and|i want you to|id like you to|i would like you to|i need you to|lets|let us)\s+)?(?:just\s+|quickly\s+)?/;
const TAIL = /(?:\s+(?:please|jarvis|for me|thanks|thank you|now|right now|real quick|sir|again))+$/;

/**
 * Lowercase words: apostrophes joined ("what's" -> "whats", "Mac's" -> "macs"), other punctuation
 * off, the fillers at both ends removed.
 */
export function normalizeAppText(text) {
  let s = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/(\w)'(\w)/g, '$1$2')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 3; i++) s = s.replace(LEAD, '').replace(TAIL, '').trim();
  return s;
}

// ---------------------------------------------------------------------------------------------
// The app's own commands

const SHOW = '(?:open|open up|show|show me|bring up|pull up|go to|take me to|let me see|can i see|display)';
const OWN = '(?:the |my |your )?';

const NEW_CHAT = /^(?:(?:start|open|begin|make|create|give me|get me|i want|i need|id like)(?: me)?(?: a| another)? )?(?:new|fresh|clean|brand new|another) (?:chat|conversation)$|^(?:clear|reset|wipe)(?: the| this| my)? (?:chat|conversation)$/;
const HISTORY = new RegExp(`^${SHOW} ${OWN}(?:(?:chat|conversation) )?history$|^${SHOW} (?:my |the )?(?:old |past |previous |recent |earlier |saved )?(?:chats|conversations)$`);
// Settings → a section, by what the owner calls it (Settings' own ids: src/ui/settings.js).
const SECTIONS = [
  ['voice', 'voice|speech|sound|listening|microphone|mic|wake word|wake|standby|speaker|audio'],
  ['appearance', 'appearance|theme|look'],
  ['memory', 'memory'],
  ['apikey', 'api key|api|key|spending|billing|cost'],
  ['homebase', 'home base|homebase|jarvis core'],
  ['location', 'location'],
  ['ai', 'ai|model|agents|agent'],
  ['profile', 'profile|name'],
  ['data', 'data|backup|backups'],
];
const SECTION_WORDS = SECTIONS.map(([, w]) => w).join('|');
const SETTINGS = new RegExp(`^${SHOW} ${OWN}(?:jarviss )?(?:(${SECTION_WORDS}) )?(?:settings|preferences|options)$`);
const LIBRARY = new RegExp(`^${SHOW} ${OWN}(?:library|blueprint library|hologram library|saved (?:holograms|blueprints|items|things|models|stuff)|blueprints|holograms)$`);
const MISSION = new RegExp(`^${SHOW} (?:the )?(?:mission control|mission)$`);
const HOMEBASE = new RegExp(`^${SHOW} (?:the |my )?(?:home ?base|jarvis core)(?: (?:sheet|panel|page|dashboard|screen|card))?$`);

const RATE = /^(?:(?:speak|talk|read|go)(?: a)?(?: (?:little|bit|lot|tad))?(?: bit)? (slower|faster|more slowly|more quickly|quicker|slowly)|(slow) down(?: a (?:little|bit))?|(speed) up(?: a (?:little|bit))?)$/;
const CONTINUOUS = /^(?:turn|switch|set) (?:the )?continuous(?: mode| conversation| listening)? (off|on)$|^(?:turn|switch) (off|on) (?:the )?continuous(?: mode| conversation| listening)?$|^continuous(?: mode| conversation| listening)? (off|on)$|^(stop|start) (?:the )?continuous(?: mode| conversation| listening)?$/;
const SEND_NOW = /^(?:send (?:what you hear |what i say |my words )?(?:right away|straight away|immediately|at once)|(?:skip|turn off|switch off|no more) (?:the )?(?:2 second |two second )?(?:check|countdown)|dont (?:wait|show me what you heard)(?: before (?:sending|you send))?)$/;
const SHOW_FIRST = /^(?:show (?:me )?what you heard(?: first)?|show then send|(?:turn on|switch on|bring back) (?:the )?(?:2 second |two second )?(?:check|countdown)|check (?:with me )?before (?:you send|sending))$/;
const GEORGE = /^(?:use|switch to|change to|go back to|turn on|talk with|speak with|talk in|speak in)(?: the)? (?:george|georges voice|george voice|natural voice|your natural voice)$/;
const DEVICE = /^(?:use|switch to|change to|go back to)(?: the| your| my)? (?:mac|macs|macbook|macbooks|iphone|iphones|ipad|ipads|phone|phones|computer|computers|device|devices|built in|builtin|system|normal|regular|own) (?:own )?voice$|^(?:turn off|stop using|switch off) (?:george|the natural voice|natural voice|georges voice)$/;

const SPENT = /^(?:how much (?:have i|did i|have we|did we|ive|i have) (?:spent|spend|used)|what (?:have i|did i) spent|how much money (?:have i|did i|ive) (?:spent|spend)|(?:whats|what is) (?:my|the) (?:spend|spending|bill|total spend))(?: (?:on|with|using|in) (?:jarvis|claude|you|the api|this app))?(?: (today|this month|so far|in total))?$/;
const LIVE_COST = /^(?:how much (?:has|did|does|is) (?:the )?(?:live view|video mode) (?:cost|costing|spent|been costing)(?: me)?(?: so far| this hour| today)?|(?:whats|what is) (?:the )?(?:live view|video mode)(?: cost| spend| bill)(?: so far| this hour)?)$/;

function sectionOf(word) {
  if (!word) return null;
  for (const [id, words] of SECTIONS) if (new RegExp(`^(?:${words})$`).test(word)) return id;
  return null;
}

/** The app's own command in `text` (see the header), or null. `state` is the router's state. */
export function matchAppCommand(text, state = {}) {
  const s = normalizeAppText(text);
  if (!s || s.split(' ').length > 12) return null;
  if (NEW_CHAT.test(s)) return act('new-chat');
  if (HISTORY.test(s)) return act('open', { sheet: 'history' });
  let m = SETTINGS.exec(s);
  if (m) return act('open', { sheet: 'settings', section: sectionOf(m[1]) });
  if (LIBRARY.test(s)) return act('open', { sheet: 'library' });
  if (MISSION.test(s)) return act('open', { sheet: 'mission' });
  if (HOMEBASE.test(s)) return act('open', { sheet: 'homebase' });
  m = RATE.exec(s);
  if (m) return act('voice-rate', { faster: /faster|quick|speed/.test(s) });
  m = CONTINUOUS.exec(s);
  if (m) {
    const word = m[1] || m[2] || m[3] || m[4];
    return act('setting', { key: 'voiceContinuous', value: word === 'on' || word === 'start' });
  }
  if (SEND_NOW.test(s)) return act('setting', { key: 'listenSend', value: 'now' });
  if (SHOW_FIRST.test(s)) return act('setting', { key: 'listenSend', value: 'show' });
  if (GEORGE.test(s)) return act('voice', { which: 'george' });
  if (DEVICE.test(s)) return act('voice', { which: 'device' });
  m = SPENT.exec(s);
  if (m) return act('spend', { period: m[1] === 'today' ? 'today' : m[1] === 'this month' ? 'month' : 'both' });
  if (LIVE_COST.test(s)) return act('spend', { period: 'live' });
  return null;
}

// ---------------------------------------------------------------------------------------------
// SHOULD C5 and C6

const SCREEN_LOOK = /^(?:(?:take a )?look at|check|read|see|look over)(?: what is on)? (?:my|the) (?:screen|display|monitor)$|^(?:whats|what is) on (?:my|the) (?:screen|display)$|^(?:can you see|do you see) my screen$|^(?:share|show you) my screen$/;

/** C5: "look at my screen" (a Look at the screen, after a tap on its button), or null. */
export function matchScreenLook(text, state = {}) {
  const s = normalizeAppText(text);
  return s && SCREEN_LOOK.test(s) ? act('screen-look', { free: false, camera: true, ...priced(state && state.lookUsd) }) : null;
}

/** C6: "brief me" with no home base linked (with one, its own briefing answers, free), or null. */
export function matchBriefing(text, state = {}) {
  if (state && state.homebase && state.homebase.linked) return null;
  const cmd = typeof text === 'string' ? matchBrainCommand(text) : null;
  return cmd && cmd.kind === 'brief' ? act('brief', { free: false, ...priced(state && state.briefingUsd) }) : null;
}

// ---------------------------------------------------------------------------------------------
// Voice Mode's controls

const HUSH = /^(?:stop (?:talking|speaking|reading)(?: please)?|be quiet|quiet|hush|shush|shh+|silence|enough|thats enough|that is enough|you can stop talking|cut it out|stop the voice)$/;
const READ_FULL = /^(?:read (?:me |out )?(?:the )?(?:full|whole|entire|complete|long) (?:answer|reply|response|thing|text|version)|read (?:me |out )?(?:the )?rest(?: of it| of the answer| of the reply)?|read (?:me |out )?(?:all )?(?:the )?details|read (?:me )?(?:all of it|everything|it all)|keep reading|read on)$/;
// ("Again" at the end is a filler, so "say that again" arrives as "say that".)
const REPEAT = /^(?:sorry )?(?:repeat(?: that| it| yourself| the answer| the last part| what you said)?|say (?:that|it)(?: again)?|(?:say|repeat) (?:that|it) one more time|what did you (?:just )?say|what was that|come again|pardon(?: me)?|i didnt (?:catch|hear|get) (?:that|it|what you said))$/;
// ("Turn the mic off", "switch your microphone off" too: ROUTING-R3-S2.)
const MIC_OFF = /^(?:stop listening(?: to me)?|dont listen|quit listening|pause listening|stop the (?:mic|microphone)|(?:mute|turn off|switch off|close) (?:the |your |my )?(?:mic|microphone)|(?:turn|switch|shut) (?:the |your |my )?(?:mic|microphone) off|(?:mic|microphone) off)$/;
const EXIT_VOICE = /^(?:exit|close|leave|quit|end|turn off|stop|get out of|switch off|shut) (?:the )?voice(?: mode)?$/;

/** One of Voice Mode's controls in `text` (see the header), or null. */
export function matchVoiceControl(text, state = {}) {
  const s = normalizeAppText(text);
  if (!s || s.split(' ').length > 10) return null;
  if (HUSH.test(s)) return act('hush');
  if (READ_FULL.test(s)) return act('read-full');
  if (REPEAT.test(s)) return act('repeat');
  if (MIC_OFF.test(s)) return act('mic-off', { mic: true });
  if (EXIT_VOICE.test(s)) return act('exit-voice', { mic: true, undo: false });
  return null;
}

// ---------------------------------------------------------------------------------------------
// The `stop` layer

const STOP = /^(?:(?:ok|okay|no|wait|oh) )?stop(?: (?:it|now|everything|all of it|stop|right there|right now))*$/;
const TASK_OVER = /^(?:done|stopped|failed|error|finished|cancelled|canceled|refused|closed)$/;

/** True while a Jarvis for Chrome task runs (contract (f): state.chrome.task with a live status). */
export function chromeTaskRunning(state = {}) {
  const t = state && state.chrome && state.chrome.task;
  return !!(t && typeof t === 'object' && !TASK_OVER.test(String(t.status || '')));
}

/**
 * What a bare "stop" stops in `state`, in the order Jarvis says it. `state.running`: a turn runs in this
 * window, in the open chat or another one (an answer, a research mission, a Look's answer), stopped as each
 * chat's Stop button stops it; `state.optics.watch`: Optics' Watch is on. Both cost money while they run
 * (REGRESS-2, ROUTING-R2-3). `state.runningElsewhere`: another Jarvis window runs one, which this window can't
 * stop: 'elsewhere' says where it runs (never "Okay." while a paid run goes on).
 */
export function stopTargets(state = {}) {
  const out = [];
  if (state.tour && state.tour.active) out.push('tour');
  if (state.running) out.push('answer');
  if (state.runningElsewhere) out.push('elsewhere');
  if (chromeTaskRunning(state)) out.push('chrome');
  if (state.optics && state.optics.watch) out.push('watch');
  if (state.optics && state.optics.liveView) out.push('liveview');
  if (state.music && state.music.playing) out.push('music');
  if (state.speaking) out.push('speech');
  return out;
}

/**
 * A bare "stop" (also "okay, stop", "stop it", "stop everything"): everything that runs stops at once
 * (a tour pauses; the chat's turn, a Chrome task, Watch, the live view, a preview and Jarvis's voice
 * stop). Nothing running:
 * "Okay." (free; never a question for Claude), unless a hologram is on screen (under a blueprint sheet
 * too), whose own "stop" holds the model still; a blueprint sheet alone has no "stop" of its own
 * (ROUTING-6). "Stop the tour" and "stop Chrome" belong to the tour and to Chrome.
 */
export function matchStopWord(text, state = {}) {
  const s = normalizeAppText(text);
  if (!s || !STOP.test(s)) return null;
  const targets = stopTargets(state);
  if (!targets.length && state.hologram && state.hologram.open) return null;
  return act('stop', { targets });
}

// ---------------------------------------------------------------------------------------------
// What Jarvis says (R9: one short line for every local action)

/** Settings' rate, one step slower or faster, kept within 0.7-1.5 (to one decimal). */
export function nextVoiceRate(rate, faster) {
  const now = Number.isFinite(Number(rate)) ? Number(rate) : 1;
  const next = now + (faster ? VOICE_RATE.step : -VOICE_RATE.step);
  return Math.round(Math.min(VOICE_RATE.max, Math.max(VOICE_RATE.min, next)) * 10) / 10;
}

/** "about 42 cents", "about $3.20", "less than a cent" ('' for nothing). */
export function moneyWords(usd) {
  const v = Number(usd);
  if (!Number.isFinite(v) || v <= 0) return '';
  if (v < 0.005) return 'less than a cent';
  if (v < 1) {
    const c = Math.round(v * 100);
    return `about ${c} cent${c === 1 ? '' : 's'}`;
  }
  return `about $${v.toFixed(2)}`;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The spend readout (free, from this device's own counts: src/platform/spend.js; the live view's hour:
 * src/lib/live-view.js). period: 'today' | 'month' | 'both' | 'live'.
 */
export function spendLine({ period = 'both', todayUsd = 0, monthUsd = 0, liveUsd = 0 } = {}) {
  const today = moneyWords(todayUsd);
  const month = moneyWords(monthUsd);
  if (period === 'live') {
    const live = moneyWords(liveUsd);
    return live ? `The live view has cost ${live} this hour.` : "The live view hasn't cost anything this hour.";
  }
  if (period === 'today') return today ? `${cap(today)} today.` : 'Nothing spent today.';
  if (period === 'month') return month ? `${cap(month)} this month.` : 'Nothing spent this month.';
  if (!month) return 'Nothing spent this month.';
  return today ? `${cap(today)} today, ${month} this month.` : `Nothing today, ${month} this month.`;
}

const SHEETS = {
  history: 'Your history is open.',
  library: 'Your library is open.',
  mission: 'Mission Control is open.',
  homebase: 'The home base is open.',
};
const SECTION_NAMES = {
  voice: 'Voice settings are open.',
  appearance: 'Appearance settings are open.',
  memory: 'Memory settings are open.',
  apikey: 'API key and spending are open.',
  homebase: 'Home base settings are open.',
  location: 'Location settings are open.',
  ai: 'AI settings are open.',
  profile: 'Profile settings are open.',
  data: 'Data settings are open.',
};
const ELSEWHERE = "I'm still answering in another window. Stop it there.";
const ELSEWHERE_AFTER = "I'm still answering in another window: stop it there.";

/** The answer target's part, from what it stopped: the open chat's run (here) and other chats' (other). */
function answersStopped({ here = 0, other = 0 } = {}) {
  const h = Number(here) || 0;
  const n = Number(other) || 0;
  if (h && n) return 'the answers are stopped';
  if (n === 1) return 'the answer in your other chat is stopped';
  if (n > 1) return 'the answers in your other chats are stopped';
  return h ? 'the answer is stopped' : '';
}

const STOPPED = {
  tour: 'the tour is paused',
  answer: 'the answer is stopped',
  chrome: 'Chrome is stopping',
  watch: 'Watch is off',
  liveview: 'the live view is off',
  music: 'the music is off',
};

/**
 * The one short line for an action that has acted. `outcome` carries what happened when it matters:
 *   open homebase     { linked: false }       the setup opened instead
 *   open mission      { none: true }          there's no mission to show
 *   voice-rate        { rate, limit: true }   already at the slowest or fastest
 *   voice             { ok, needsDownload, device: 'Mac' | 'iPhone' | 'iPad' | … }
 *   spend             { todayUsd, monthUsd, liveUsd }
 *   read-full, repeat { none: true }          nothing to read or repeat
 *   mic-off           { woken: true }         a woken session goes back to Standby
 *   stop              { stopped: { chrome: { withdrawn, stopping } } }   what the Chrome target did
 */
export function appCommandLine(action, outcome = {}) {
  const a = action && typeof action === 'object' ? action : {};
  const o = outcome && typeof outcome === 'object' ? outcome : {};
  switch (a.do) {
    case 'new-chat':
      return 'New chat.';
    case 'open':
      if (a.sheet === 'settings') return SECTION_NAMES[a.section] || 'Settings are open.';
      if (a.sheet === 'homebase' && o.linked === false) return "The home base isn't linked yet. Here's how to set it up.";
      if (a.sheet === 'mission' && o.none) return "There's no mission to show yet.";
      return SHEETS[a.sheet] || '';
    case 'voice-rate':
      if (o.limit) return a.faster ? "That's as fast as I go." : "That's as slow as I go.";
      return a.faster ? 'Faster.' : 'Slower.';
    case 'setting':
      if (a.key === 'voiceContinuous') return a.value ? "Continuous conversation on: I'll listen after each answer." : 'Continuous conversation off. Tap me when you need me.';
      if (a.key === 'listenSend') return a.value === 'now' ? "I'll send what I hear right away." : "I'll show what I heard for 2 seconds first.";
      return 'Done.';
    case 'voice':
      if (a.which === 'george') {
        if (o.needsDownload) return 'George needs a one-time download first. Voice settings are open.';
        return o.ok === false ? "George isn't available right now." : 'This is George.';
      }
      return `This is the ${o.device || 'device'}'s own voice.`;
    case 'spend':
      return spendLine({ period: a.period, todayUsd: o.todayUsd, monthUsd: o.monthUsd, liveUsd: o.liveUsd });
    case 'hush':
      return 'Okay.';
    case 'read-full':
      return o.none ? "There's nothing more to read." : '';
    case 'repeat':
      return o.none ? "I haven't said anything yet." : '';
    case 'mic-off':
      return o.woken ? "I've stopped listening. Say 'Hey Jarvis' when you need me." : "I've stopped listening. Tap me when you need me.";
    case 'exit-voice':
      return 'Closing Voice Mode.';
    case 'screen-look':
      if (o.supported === false) return "I can't see this screen.";
      return `Tap Look at my screen when you're ready. A Look costs ${moneyWords(a.usd > 0 ? a.usd : LOOK_USD)}.`;
    case 'brief':
      return `Your briefing sends a team of agents to look up the news, ${moneyWords(a.usd > 0 ? a.usd : BRIEFING_USD)}. Shall I run it?`;
    case 'stop': {
      // The Chrome target says what it did (o.stopped.chrome: { withdrawn, stopping }): a task still in its
      // check was withdrawn ("Okay, nothing sent to Chrome."), a task that runs is stopping, or both.
      const chrome = o.stopped && typeof o.stopped === 'object' && o.stopped.chrome && typeof o.stopped.chrome === 'object' ? o.stopped.chrome : null;
      const lead = chrome && chrome.withdrawn ? (chrome.stopping ? 'Okay, nothing sent.' : 'Okay, nothing sent to Chrome.') : '';
      // The answer target says which chats' runs it stopped (o.stopped.answer: { here, other }: ROUTING-R2-3).
      const answer = o.stopped && typeof o.stopped === 'object' && o.stopped.answer && typeof o.stopped.answer === 'object' ? o.stopped.answer : null;
      const part = (t) => (t === 'chrome' && chrome && !chrome.stopping ? '' : t === 'answer' && answer ? answersStopped(answer) : STOPPED[t]);
      const targets = Array.isArray(a.targets) ? a.targets : [];
      const parts = targets.map(part).filter(Boolean);
      // Another window's run can't be stopped here: where it runs, last (never "Okay." while it goes on).
      const there = targets.includes('elsewhere');
      if (!parts.length) return lead ? `${lead}${there ? ` ${ELSEWHERE}` : ''}` : there ? ELSEWHERE : 'Okay.';
      const said = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
      const line = lead ? `${lead} ${cap(said)}.` : `${cap(said)}.`;
      return there ? `${line} ${ELSEWHERE_AFTER}` : line;
    }
    default:
      return '';
  }
}
