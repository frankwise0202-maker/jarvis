// The mini status assistant: local, rule-based, free. It answers simple questions about this computer's
// health from the live report, the 7-day history and the event log, and nothing else. No network, no
// model, no secrets.
//
//   ask(q, ctx) → { answer, facts, intent, suggestions }
//     ctx: { s (snapshot), history, events, now, owner, tz }

import { classify, INTENTS } from './intents.mjs';
import * as A from './answers.mjs';

const BUILDERS = {
  greeting: A.greeting,
  'how-are-you': A.howAreYou,
  status: A.status,
  problems: A.problemsAnswer,
  events: A.eventsAnswer,
  cpu: A.cpu,
  gpu: A.gpu,
  memory: A.memory,
  disk: A.disk,
  network: A.network,
  api: A.api,
  site: A.site,
  tailscale: A.tailscale,
  temperature: A.temperature,
  multi: A.multi,
  uptime: A.uptime,
  restarts: A.restarts,
  trend: A.trend,
  time: A.time,
  thanks: A.thanks,
  bye: A.bye,
  identity: A.identity,
  capabilities: A.capabilities,
  unknown: A.unknown,
};

export { INTENTS, classify };

export function ask(q, ctx) {
  const cls = classify(q);
  if (!ctx?.s) {
    return { answer: 'I am just starting up; ask me again in a second.', facts: {}, intent: cls.intent, suggestions: ['How are you?'] };
  }
  const build = BUILDERS[cls.intent] ?? A.unknown;
  let out;
  try {
    out = build(ctx, cls);
  } catch (err) {
    out = { answer: "Sorry, I couldn't put that answer together. The live report on screen has the numbers.", facts: { error: String(err?.message ?? err) }, suggestions: ['How are you?'] };
  }
  const facts = { ...out.facts };
  if (cls.topics?.length) facts.topics = cls.topics;
  if (cls.aspects?.length) facts.aspects = cls.aspects;
  return { answer: out.answer, facts, intent: cls.intent, suggestions: out.suggestions ?? [] };
}
