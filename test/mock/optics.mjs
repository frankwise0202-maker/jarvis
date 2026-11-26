// Mock behavior for Optics (lead tools version 5: pin_labels, look_through_camera) and Watch.
// See test/mock/README.md. Only tools the request defines are ever called, as with the real API.
//
//   An "Optics frame fN" line in the newest <turn_context> (a Look): a first sentence naming what
//     is in the synthetic desk scene, then pin_labels on fN with the scene's objects (positions
//     from fixtures/optics-scene.json, scaled to the frame, portrait or landscape), then a closing
//     sentence after the result. Without pin_labels (an older conversation): one plain answer.
//   [[optics:nolabels]]   a Look answered in words only
//   [[optics:badframe]]   pin_labels on a frame that does not exist first, then the right one
//   [[optics:offframe]]   one label far outside the frame (Jarvis skips it and says so)
//   [[optics:look]]       text only: "Let me take a look", look_through_camera, then pin_labels on
//                         the frame it returned (when the turn context says the camera is live)
//   Watch: a structured request whose system prompt is Jarvis Watch's gets a realistic
//     { worth_saying, line, summary }: the first frame sets the scene, later ones report a change.
//   Live view (v8.0): a structured request whose system prompt starts "You are Jarvis Live view"
//     gets { summary, worth_saying, line } with usage, scripted per test (configureLive): a scene
//     (one answer per look, the last one repeated), a cost per look, 429s with retry-after, 529s, a
//     refusal, a reply cut short, and slow replies. Without a script: a desk scene where the owner
//     holds up an AA battery on the third look.
//   Follow-ups in a conversation with an Optics frame (Optics' chips and words):
//     "Show me a hologram of the AA battery."  show_hologram with the battery sample (alternator /
//                         Camry when named), spoken lines in Voice Mode
//     "Tell me more."     a longer answer about the scene
//     "What's this part? (the screwdriver you pinned on frame f1, at 466, 810)"  what that object
//                         is, then pin_labels with that one label, then "I've marked it on the frame."

//   Research (v8.1, Track 5): researchPlan(env), asked by behavior.mjs before the Optics follow-ups.
//     The quick way of "research this" (src/lib/research-offer.js researchPrompt: "Research this with a
//     web search and give me a quick answer: <subject>."): one web search, then a short answer about
//     the subject, spoken-style in Voice Mode. The mission ("Research <subject>: …", swarm mode) and
//     anything else: null (the mock goes on as before).

import { readFileSync } from 'node:fs';
import { newServerToolUseId, newToolUseId, seededRandom } from './util.mjs';
import { searchResults } from './content.mjs';

export const OPTICS_TOOL_NAMES = Object.freeze(['pin_labels', 'look_through_camera']);
const text = (t) => ({ type: 'text', text: t, citations: null });

let scene = null;
function sceneFixture() {
  if (!scene) scene = JSON.parse(readFileSync(new URL('./fixtures/optics-scene.json', import.meta.url), 'utf8'));
  return scene;
}

/** The newest "Optics frame" line of a turn context or tool result: { id, width, height, source } or null. */
export function opticsFrameOf(textBlock) {
  const m = /Optics frame (f\d+): the image in this message is a live frame from the owner's ([a-z ]+?)(?: \(a screenshot of their computer\))?, (\d+)×(\d+) pixels/.exec(String(textBlock || ''));
  if (!m) return null;
  const source = /screen/.test(m[2]) ? 'screen' : /front/.test(m[2]) ? 'front' : /rear/.test(m[2]) ? 'rear' : 'camera';
  return { id: m[1], width: Number(m[3]), height: Number(m[4]), source };
}

export function cameraIsLive(ctxText) {
  return /^Optics: the camera is live\b/m.test(String(ctxText || ''));
}

/** The scene's labels in the pixels of `frame` (portrait or landscape framing). */
export function sceneLabels(frame, { variant = '' } = {}) {
  const f = sceneFixture();
  const layout = frame.height > frame.width ? f.portrait : variant === 'b' ? f['landscape-b'] : f.landscape;
  return layout.labels.map((l) => ({ text: l.text, x: Math.round(l.x * frame.width), y: Math.round(l.y * frame.height) }));
}

const FIRST_LINE = {
  screen: "That's a test screen: a frame clock at the top left and a moving test pattern. I've pinned both.",
  default: "That's your desk, sir: a coffee mug, an AA battery, a pothos, a notebook and a screwdriver. I've pinned them for you.",
};

/** A Look: thinking, a first sentence, then pin_labels (or one plain answer without the tool). */
export function opticsLookPlan({ think, frame, d, pinsTool }) {
  const arg = d.arg('optics').toLowerCase();
  if (!pinsTool || arg === 'nolabels') {
    return {
      blocks: [
        think(`An Optics frame (${frame.id}, ${frame.width}×${frame.height}). Describe what is visible.`),
        text(`${FIRST_LINE.default.replace(" I've pinned them for you.", '')} The battery is a standard 1.5-volt alkaline AA, and the pothos looks healthy.`),
      ],
      stop_reason: 'end_turn',
      pace: 'normal',
    };
  }
  // A screen frame (the test rig's fake screen: a timestamp at the top left, a pattern in the middle).
  let labels = frame.source === 'screen'
    ? [{ text: 'Frame clock', x: Math.round(frame.width * 0.08), y: Math.round(frame.height * 0.04) }, { text: 'Test pattern', x: Math.round(frame.width * 0.56), y: Math.round(frame.height * 0.55) }]
    : sceneLabels(frame);
  if (arg === 'offframe') labels = [...labels.slice(0, 3), { text: 'Lamp', x: frame.width + 400, y: Math.round(frame.height / 2) }];
  return {
    blocks: [
      think(`An Optics frame (${frame.id}, ${frame.width}×${frame.height}). I can see ${labels.length} objects; I'll name them and pin each one at its center.`),
      text(frame.source === 'screen' ? FIRST_LINE.screen : FIRST_LINE.default),
      { type: 'tool_use', id: newToolUseId(), name: 'pin_labels', input: { frame: arg === 'badframe' ? 'f99' : frame.id, labels } },
    ],
    stop_reason: 'tool_use',
    pace: 'normal',
    jsonChunk: 18,
  };
}

/** [[optics:look]]: a short sentence, then look_through_camera. */
export function lookThroughCameraPlan({ think }) {
  return {
    blocks: [
      think('The owner wants me to look again; the camera is live, so I will take one fresh frame.'),
      text('Let me take a look.'),
      { type: 'tool_use', id: newToolUseId(), name: 'look_through_camera', input: { reason: 'to see what you are pointing at' } },
    ],
    stop_reason: 'tool_use',
    pace: 'quick',
  };
}

/**
 * After an Optics tool round: `use` is the tool_use, `result` its tool_result block, `resultText`
 * its text. Returns a plan.
 */
export function opticsFollowUpPlan({ think, use, result, resultText, body }) {
  if (use.name === 'look_through_camera') {
    const frame = opticsFrameOf(resultText);
    if (result?.is_error || !frame) {
      return { blocks: [text("I can't see through the camera right now. Open Optics and tap Look, and I'll have a look.")], stop_reason: 'end_turn', pace: 'quick' };
    }
    if (!body.tools?.some((t) => t?.name === 'pin_labels')) {
      return { blocks: [text('I see your desk: the mug, the battery and the pothos are where you left them.')], stop_reason: 'end_turn', pace: 'quick' };
    }
    return {
      blocks: [
        think(`A fresh frame (${frame.id}). Pin what is in it.`),
        text("Here's what I see now."),
        { type: 'tool_use', id: newToolUseId(), name: 'pin_labels', input: { frame: frame.id, labels: sceneLabels(frame).slice(0, 3) } },
      ],
      stop_reason: 'tool_use',
      pace: 'normal',
      jsonChunk: 18,
    };
  }
  // pin_labels
  if (result?.is_error) {
    const m = /The newest frame is (f\d+)/.exec(resultText);
    if (m) {
      const frame = { id: m[1], ...frameSizeOf(resultText, m[1]) };
      return {
        blocks: [
          think('Wrong frame id; pin again on the newest frame.'),
          { type: 'tool_use', id: newToolUseId(), name: 'pin_labels', input: { frame: frame.id, labels: sceneLabels(frame) } },
        ],
        stop_reason: 'tool_use',
        pace: 'normal',
        jsonChunk: 18,
      };
    }
    return { blocks: [text('I couldn’t pin labels on that frame, but the objects are a coffee mug, an AA battery, a pothos, a notebook and a screwdriver.')], stop_reason: 'end_turn', pace: 'quick' };
  }
  const skipped = /outside the \d+×\d+ frame/.test(resultText) ? ' One label fell outside the frame, so I left it off.' : '';
  const screen = /Frame clock/.test(resultText);
  const one = /^Pinned 1 label\b/.test(resultText); // "What's this part?": the tapped object, pinned again
  return {
    blocks: [text(screen ? 'Nothing on it needs your attention.' : one ? "I've marked it on the frame." : `The AA is a standard 1.5-volt alkaline cell, and the pothos would like a little more light.${skipped}`)],
    stop_reason: 'end_turn',
    pace: 'quick',
  };
}

function frameSizeOf(resultText, id) {
  const m = new RegExp(`${id} \\((\\d+)×(\\d+)\\)`).exec(resultText);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1280, height: 720 };
}

// ---------------------------------------------------------------------------------------------
// Watch (one-off structured requests)

export function isWatchRequest(body) {
  const system = typeof body.system === 'string' ? body.system : Array.isArray(body.system) ? body.system.map((b) => b?.text || '').join('\n') : '';
  return /^You are Jarvis Watch\b/.test(system);
}

/** { worth_saying, line, summary } as JSON text: the first frame sets the scene, then changes. */
export function watchAnswer(body) {
  const user = [...body.messages].reverse().find((m) => m.role === 'user');
  const textOf = (user?.content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  const first = /Previous summary: \(none yet\)/.test(textOf);
  const answer = first
    ? { worth_saying: false, line: '', summary: 'A desk with a coffee mug, an AA battery, a pothos, a notebook and a screwdriver.' }
    : { worth_saying: true, line: 'Your mug has moved next to the pothos, the notebook is gone, and a phone has appeared.', summary: 'The mug is beside the pothos; a phone lies where the notebook was.' };
  return JSON.stringify(answer);
}

// ---------------------------------------------------------------------------------------------
// Live view (one-off structured requests on Claude Haiku 5.5, about once a second)

export function isLiveRequest(body) {
  const system = typeof body.system === 'string' ? body.system : Array.isArray(body.system) ? body.system.map((b) => b?.text || '').join('\n') : '';
  return /^You are Jarvis Live view\b/.test(system);
}

/** The default scene: the desk, then the owner holds up an AA battery, then puts it down. */
export const LIVE_DEFAULT_SCENE = Object.freeze([
  { summary: 'A desk with a coffee mug, an AA battery, a pothos, a notebook and a screwdriver.', worth_saying: false, line: '' },
  { summary: 'The same desk; nothing has moved.', worth_saying: false, line: '' },
  { summary: 'The owner holds up an AA battery to the camera.', worth_saying: true, line: 'That’s a Duracell AA, 1.5 volts.' },
  { summary: 'The owner puts the battery back on the desk.', worth_saying: false, line: '' },
]);

/**
 * Per-test script for the live view (E2E: configureLive(t.mock, { … }) after the mock's reset):
 *   scene: [{ summary, worth_saying, line }]   one per look; the last is repeated
 *   costUsd: n                                  the usage of each answer is sized to cost about n on Haiku 5.5
 *   delayMs: n                                  each answer waits n ms (a slow reply)
 *   errors: { [look#]: { status: 429|529, retryAfter?: seconds } | 'refusal' | 'cut' }   look# from 1
 */
export function configureLive(mock, config = {}) {
  mock.state.live = { scene: Array.isArray(config.scene) && config.scene.length ? config.scene : LIVE_DEFAULT_SCENE, costUsd: Number(config.costUsd) || 0, delayMs: Number(config.delayMs) || 0, errors: config.errors || {} };
  mock.state.liveLooks = 0;
  return mock.state.live;
}

/**
 * A live look: { error } (a scripted 429 / 529) or { plan } whose text is the scripted JSON. The
 * look number counts every live request this test (rate-limited ones too).
 */
export function liveLookPlan(body, state) {
  const cfg = state.live || { scene: LIVE_DEFAULT_SCENE, costUsd: 0, delayMs: 0, errors: {} };
  state.liveLooks = (state.liveLooks || 0) + 1;
  const n = state.liveLooks;
  const err = cfg.errors && cfg.errors[n];
  if (err && typeof err === 'object' && (err.status === 429 || err.status === 529)) {
    const retryAfter = err.retryAfter;
    const headers = { 'x-should-retry': 'true' };
    if (retryAfter !== undefined && retryAfter !== null) headers['retry-after'] = String(retryAfter);
    return err.status === 429
      ? { error: { status: 429, type: 'rate_limit_error', message: "This request would exceed your organization's rate limit of 50 requests per minute (model: claude-haiku-5-5). Please try again later.", headers } }
      : { error: { status: 529, type: 'overloaded_error', message: 'Overloaded', headers } };
  }
  const answered = (state.liveAnswered = (state.liveAnswered || 0) + 1);
  const pick = cfg.scene[Math.min(answered, cfg.scene.length) - 1] || cfg.scene[cfg.scene.length - 1];
  const answer = { summary: String(pick.summary || ''), worth_saying: pick.worth_saying === true, line: pick.worth_saying === true ? String(pick.line || '') : '' };
  const plan = { blocks: [text(JSON.stringify(answer))], stop_reason: 'end_turn', pace: 'quick' };
  if (err === 'refusal') {
    plan.blocks = [];
    plan.stop_reason = 'refusal';
  } else if (err === 'cut') {
    plan.blocks = [text(JSON.stringify(answer).slice(0, 30))];
    plan.stop_reason = 'max_tokens';
  }
  // Haiku 5.5: $0.10 per million input tokens. The usage is sized so the look costs about costUsd.
  if (cfg.costUsd > 0) plan.usage = { input_tokens: Math.round(cfg.costUsd / 1e-7), cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 };
  if (cfg.delayMs > 0) plan.delayMs = cfg.delayMs;
  return { plan };
}

// ---------------------------------------------------------------------------------------------
// Follow-ups in a conversation that has looked through the camera (Optics' chips and words)

/** The newest Optics frame seen anywhere in the conversation (a Look, or a frame Jarvis took). */
export function conversationFrameOf(messages) {
  let found = null;
  for (const m of Array.isArray(messages) ? messages : []) {
    if (m?.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const b of m.content) {
      const texts = b?.type === 'text' ? [b.text] : b?.type === 'tool_result' && Array.isArray(b.content) ? b.content.filter((x) => x?.type === 'text').map((x) => x.text) : [];
      for (const t of texts) {
        const f = opticsFrameOf(t);
        if (f) found = f;
      }
    }
  }
  return found;
}

/** "Show me a hologram of the AA battery." -> 'AA battery' ('' for "of this"); null when it is not one. */
export function hologramSubjectOf(prompt) {
  const m = /\bhologram of (?:the |a |an )?([^.?!\n]+)/i.exec(String(prompt || ''));
  if (!m) return null;
  const subject = m[1].trim();
  return /^(this|that|it|what you see)$/i.test(subject) ? '' : subject;
}

/** The hologram fixture for what was seen (the desk scene's battery, unless the words name another sample). */
export function opticsHologramSample(subject) {
  const s = String(subject || '').toLowerCase();
  if (/alternator/.test(s)) return 'alternator';
  if (/camry|car\b|toyota/.test(s)) return 'camry';
  return 'battery';
}

const PART_INFO = {
  'coffee mug': "That's a ceramic coffee mug, about 350 ml, glazed white with a dark brew still in it.",
  'aa battery': "That's an AA alkaline cell: 1.5 volts, zinc and manganese dioxide, about 2,500 mAh. The flat end is the negative terminal.",
  pothos: "That's a golden pothos (Epipremnum aureum), a trailing houseplant. The pale leaves say it wants a little more light.",
  notebook: "That's a hardback A5 notebook with a pen clipped to its cover.",
  screwdriver: "That's a flat-head screwdriver with an orange handle, a slotted tip about 5 mm wide.",
};

/**
 * "Tell me more." or "What's this part? (the screwdriver you pinned on frame f1, at 466, 810)" in a
 * conversation with an Optics frame: a text answer (the part one pins that object again when the
 * conversation has pin_labels). Null for anything else.
 */
export function opticsFollowUpTextPlan({ think, prompt, frame, pinsTool }) {
  const words = String(prompt || '').trim();
  const part = /^What['’]s this part\? \(the (.+?) you pinned(?: on frame (f\d+))?(?:, at (\d+), (\d+))?\)/i.exec(words);
  if (part) {
    const name = part[1];
    const info = PART_INFO[name.toLowerCase()] || `That's the ${name}.`;
    const blocks = [think(`The owner tapped the pin "${name}" and asks what it is.`), text(info)];
    if (pinsTool && part[2] && part[3] && part[4]) {
      blocks.push({ type: 'tool_use', id: newToolUseId(), name: 'pin_labels', input: { frame: part[2], labels: [{ text: name.length > 24 ? name.slice(0, 24) : name.replace(/^./, (c) => c.toUpperCase()), x: Number(part[3]), y: Number(part[4]) }] } });
      return { blocks, stop_reason: 'tool_use', pace: 'quick', jsonChunk: 18 };
    }
    return { blocks, stop_reason: 'end_turn', pace: 'quick' };
  }
  if (/^tell me more\b/i.test(words)) {
    return {
      blocks: [
        think(`More about frame ${frame.id}.`),
        text('A little more, sir: the mug is still warm-looking, so the coffee is fresh; the AA cell is a 1.5-volt alkaline, worth keeping for the remote; and the screwdriver is a flat-head, the right one for that battery cover.'),
      ],
      stop_reason: 'end_turn',
      pace: 'quick',
    };
  }
  return null;
}

/**
 * v8.1 (Track 5): the mock's research behaviour (E3). env: { body, d, prompt (without directives),
 * ctx, spoken, think(text), hasTool(name), userMsg, msgs, frame (the conversation's Optics frame, or
 * null), pace }. A plan, or null: the mock goes on as before.
 */
export const RESEARCH_QUICK_PREFIX = 'Research this with a web search and give me a quick answer:';

export function researchPlan(env) {
  const prompt = String((env && env.prompt) || '').trim();
  if (!prompt.startsWith(RESEARCH_QUICK_PREFIX) || !env.hasTool('web_search')) return null;
  const subject = prompt.slice(RESEARCH_QUICK_PREFIX.length).trim().replace(/[.!?]+$/, '') || 'this';
  const name = subject.replace(/\s*\(.*$/, '').trim() || subject;
  const query = `${name} specifications price reviews`;
  const id = newServerToolUseId();
  const hits = searchResults(query, seededRandom(query), 'lead');
  const first = hits[0] && hits[0].result ? hits[0].result.title : 'a reviews site';
  const answer = env.spoken
    ? `I looked it up, sir. The ${name} is well reviewed: reliable, fairly priced, and the usual pick for that job. More details are on screen.`
    : `**Research: ${name}.** A quick web search finds it well reviewed: reliable, fairly priced, and the usual pick for that job (${first}).`;
  return {
    blocks: [
      env.think(`The owner wants a quick answer about ${name}; one search will do.`),
      { type: 'server_tool_use', id, name: 'web_search', input: { query } },
      { type: 'web_search_tool_result', tool_use_id: id, content: hits.map((h) => h.result) },
      text(answer),
    ],
    stop_reason: 'end_turn',
    pace: env.pace || 'quick',
  };
}
