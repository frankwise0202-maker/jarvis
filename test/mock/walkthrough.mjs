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

/** The first response to the owner's message: a plan, or null (not a walkthrough). */
export function walkthroughPlan(env) {
  void env;
  return null;
}

/** The response after a tool round: a plan, or null (not a walkthrough's). */
export function walkthroughFollowUp(env) {
  void env;
  return null;
}
