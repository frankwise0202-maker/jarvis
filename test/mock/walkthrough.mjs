// Mock behavior for walkthroughs (v8.1, Track 2: tours writes this file). See test/mock/README.md.
//
// behavior.mjs asks these hooks while it plans a lead response; each returns a plan (as the other
// mock modules do: { blocks, stop_reason, pace, … }) or null, and null leaves the mock's routing as
// it was. B7's `[[walkthrough]]` directive (show_walkthrough, lead tools V8) goes here.
//
//   walkthroughPlan(env)        the first response to the owner's message
//   walkthroughFollowUp(env)    the response after a tool round (env.uses, env.results: this turn's
//                               tool_use blocks and their tool_result blocks by id)
// env: { body, d (directives: d.has, d.arg, d.int), prompt (without directives), ctx, spoken, think(text)
//   (a thinking block), hasTool(name), userMsg, msgs, pace }
//
// Directives and behaviour:
//   [[hologram:laptop]]   stream a show_hologram call with the generic 14-inch laptop of the walkthrough
//                         tests (test/unit/fixtures/laptop-generic.json: 16 parts, no brand or model);
//                         its follow-up is the usual one (visuals.mjs)
//   "what does that do?" while a hologram is on screen (the turn context's "On screen: …" line, SPEC
//   §29.3): the answer names the part that glows, so a test can see Claude was told about it

import { readFileSync } from 'node:fs';
import { newToolUseId } from './util.mjs';

const text = (t) => ({ type: 'text', text: t, citations: null });

let laptop = null;
/** The generic laptop hologram (a fresh copy each time). */
function laptopSpec() {
  if (!laptop) laptop = readFileSync(new URL('../unit/fixtures/laptop-generic.json', import.meta.url), 'utf8');
  return JSON.parse(laptop);
}

/** The newest owner message's <turn_context> text. */
function contextText(userMsg) {
  const blocks = userMsg && Array.isArray(userMsg.content) ? userMsg.content : [];
  const first = blocks.find((b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.startsWith('<turn_context>'));
  return first ? first.text : '';
}

/** The "On screen: …" line's glowing (else selected) part: { id, name } or null. */
function partOnScreen(ctxText) {
  const line = /^On screen: .*$/m.exec(ctxText);
  if (!line) return null;
  const m = /(?:glowing|selected): "([^"]+)" \(id: ([a-z0-9][a-z0-9_-]*)\)/.exec(line[0]);
  return m ? { name: m[1], id: m[2] } : null;
}

/** The first response to the owner's message: a plan, or null (not a walkthrough). */
export function walkthroughPlan(env) {
  const { d, think, spoken } = env;
  if (d.has('hologram') && String(d.arg('hologram') || '').toLowerCase() === 'laptop' && env.hasTool('show_hologram')) {
    const input = laptopSpec();
    return {
      blocks: [
        think(`The owner wants to see the ${input.title}. I'll build the hologram: the case first, then the parts inside it, every part labeled.`),
        text(spoken ? 'Pulling up the 14-inch laptop now.' : `Here is the ${input.title} as a hologram; it builds part by part.`),
        { type: 'tool_use', id: newToolUseId(), name: 'show_hologram', input },
      ],
      stop_reason: 'tool_use',
      pace: 'hologram',
      jsonChunk: 28,
    };
  }
  // "What does that do?" with a hologram on screen: about the part the turn context says glows.
  const part = /^\s*what does (?:that|this|it) do\b/i.test(env.prompt || '') ? partOnScreen(contextText(env.userMsg)) : null;
  if (part) {
    const name = part.name.replace(/\s*\([^)]*\)/g, '').trim();
    const said = spoken
      ? `That's the ${name.toLowerCase()}. It stores the energy that runs the laptop when it's unplugged.`
      : `That is the **${name}** (\`${part.id}\`): it stores the energy that runs the laptop when it's unplugged.`;
    return { blocks: [think(`The owner asks about the part on screen: ${part.name} (${part.id}), the one that glows.`), text(said)], stop_reason: 'end_turn', pace: env.pace };
  }
  return null;
}

/** The response after a tool round: a plan, or null (not a walkthrough's). */
export function walkthroughFollowUp(env) {
  void env;
  return null;
}
