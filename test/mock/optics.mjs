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

import { readFileSync } from 'node:fs';
import { newToolUseId } from './util.mjs';

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
  return {
    blocks: [text(screen ? 'Nothing on it needs your attention.' : `The AA is a standard 1.5-volt alkaline cell, and the pothos would like a little more light.${skipped}`)],
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
