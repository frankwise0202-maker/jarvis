// Validation of client-tool input. With eager input streaming the API does not validate tool input,
// and the SDK's tolerant parser can silently truncate malformed JSON, so we check everything here
// and answer with precise `is_error` messages the model can act on.

import { isPlainObject, singleLine, truncate } from './util.js';

export const LIMITS = Object.freeze({ missionTitle: 60, role: 40, task: 4000, fact: 300, invalidJsonEcho: 2000 });

/** Strict JSON parse of the raw streamed input. An empty buffer means "{}" (a tool with no input). */
export function parseToolJson(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== 'string') return { ok: false };
  if (raw.trim() === '') return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/** The tool_result content the API docs prescribe for unparseable tool input. */
export function invalidJsonResult(raw) {
  return {
    content: JSON.stringify({ INVALID_JSON: truncate(String(raw ?? ''), LIMITS.invalidJsonEcho) }),
    is_error: true,
  };
}

function coerceWeb(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

/**
 * deploy_agents input → { ok: true, value: { mission, agents: [{ role, task, web }] } }
 *                     | { ok: false, error }
 */
export function validateDeployInput(input) {
  const usage = 'Expected {"mission": "short title", "agents": [{"role": "…", "task": "…", "web": true}, …]}.';
  if (!isPlainObject(input)) {
    return { ok: false, error: `Invalid deploy_agents input: it must be a JSON object. ${usage}` };
  }
  const problems = [];
  const mission = typeof input.mission === 'string' ? singleLine(input.mission) : '';
  if (!mission) problems.push('"mission" must be a non-empty string (a short title for the owner, max 60 characters).');

  const agents = [];
  if (!Array.isArray(input.agents) || input.agents.length === 0) {
    problems.push('"agents" must be a non-empty array of agent objects.');
  } else {
    input.agents.forEach((a, i) => {
      if (problems.length >= 6) return;
      if (!isPlainObject(a)) {
        problems.push(`agents[${i}] must be an object with "role" and "task".`);
        return;
      }
      const role = typeof a.role === 'string' ? singleLine(a.role) : '';
      const task = typeof a.task === 'string' ? a.task.trim() : '';
      const web = coerceWeb(a.web);
      if (!role) problems.push(`agents[${i}].role must be a non-empty string (max 40 characters).`);
      if (!task) problems.push(`agents[${i}].task must be a non-empty string with complete, self-contained instructions.`);
      if (web === null) problems.push(`agents[${i}].web must be true or false.`);
      if (role && task && web !== null) {
        agents.push({ role: truncate(role, LIMITS.role), task: truncate(task, LIMITS.task), web });
      }
    });
  }

  if (problems.length) {
    return { ok: false, error: `Invalid deploy_agents input: ${problems.join(' ')} Nothing was launched; fix the input and call deploy_agents again. ${usage}` };
  }
  return { ok: true, value: { mission: truncate(mission, LIMITS.missionTitle), agents } };
}

/** update_memory input → { ok: true, value: { action, fact } } | { ok: false, error } */
export function validateMemoryInput(input) {
  const usage = 'Expected {"action": "add" | "remove", "fact": "short fact"}.';
  if (!isPlainObject(input)) return { ok: false, error: `Invalid update_memory input: it must be a JSON object. ${usage}` };
  const action = input.action;
  if (action !== 'add' && action !== 'remove') {
    return { ok: false, error: `Invalid update_memory input: "action" must be "add" or "remove". ${usage}` };
  }
  const fact = typeof input.fact === 'string' ? singleLine(input.fact) : '';
  if (!fact) return { ok: false, error: `Invalid update_memory input: "fact" must be a non-empty string. ${usage}` };
  return { ok: true, value: { action, fact: truncate(fact, LIMITS.fact) } };
}
