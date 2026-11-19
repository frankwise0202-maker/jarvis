// Strict request validation for the mock Claude API.
//
// Mirrors the real Messages API closely enough to catch harness bugs the real API would reject
// (see the infra brief): headers, body shape, model, thinking/effort/tool rules, betas, message
// structure (tool_use ↔ tool_result pairing, server-tool pairing, pause_turn resume) and the
// history-editing check emulation (thinking-block signatures bound to the conversation prefix).
//
// Every check returns an ApiError (status, type, message) instead of throwing, so callers can
// both reply with the real error JSON and record a violation.

import { canonicalJson, sha256Hex, isPlainObject } from './util.mjs';

export const MODEL_IDS = Object.freeze(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
export const MAX_TOKENS_LIMIT = 128000;
export const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
export const THINKING_DISPLAYS = Object.freeze(['summarized', 'omitted', 'updates']);
export const BETA_FALLBACKS = 'server-side-fallback-2026-07-01';
export const BETA_COMPACT = 'compact-2026-01-12';
export const BETA_CONTEXT_MANAGEMENT = 'context-management-2025-06-27';
export const BETA_BINDING = 'thinking-binding-controls-2026-08-01';
export const SERVER_TOOLS = Object.freeze({
  web_search_20260209: 'web_search',
  web_fetch_20260209: 'web_fetch',
});

// Beta header values the SDK (1.10.0) knows about, plus a few long-standing ones. Anything else is
// rejected like the real API does for values that do not exist.
export const KNOWN_BETAS = new Set([
  'computer-use-2024-10-22', 'computer-use-2025-01-24', 'output-128k-2025-02-19', 'mcp-client-2025-04-04',
  'mcp-client-2025-11-20', 'dev-full-thinking-2025-05-14', 'interleaved-thinking-2025-05-14',
  'code-execution-2025-05-22', 'code-execution-2025-08-25', 'context-1m-2025-08-07', 'context-management-2025-06-27',
  'model-context-window-exceeded-2025-08-26', 'fast-mode-2026-02-01', 'output-300k-2026-03-24',
  'user-profiles-2026-03-24', 'user-profiles-2026-08-18', 'user-profiles-2026-09-04', 'advisor-tool-2026-03-01',
  'managed-agents-2026-04-01', 'dreaming-2026-04-21', 'thinking-token-count-2026-05-13',
  'server-side-fallback-2026-06-01', 'server-side-fallback-2026-07-01', 'fallback-credit-2026-06-01',
  'fallback-credit-2026-07-01', 'agent-memory-2026-07-22', 'mid-conversation-tool-changes-2026-07-01',
  'compact-2026-01-12', 'computer-use-2025-11-24', 'mcp-tunnels-2026-06-22', 'structured-outputs-2025-11-13',
  'structured-outputs-2025-12-15', 'task-budgets-2026-03-13', 'thinking-display-updates-2026-08-18',
  'mid-conversation-output-config-2026-07-01', 'thinking-binding-controls-2026-08-01',
  'mid-conversation-system-clear-at-2026-08-21', 'compact-2026-09-04', 'inline-tools-2026-09-15',
  'mcp-client-2026-09-15', 'message-batches-2024-09-24', 'prompt-caching-2024-07-31', 'pdfs-2024-09-25',
  'token-counting-2024-11-01', 'token-efficient-tools-2025-02-19', 'files-api-2025-04-14',
  'extended-cache-ttl-2025-04-11', 'skills-2025-10-02', 'cache-diagnosis-2026-04-07',
  'fine-grained-tool-streaming-2025-05-14',
]);

// Top-level body fields the beta Messages API accepts (MessageCreateParamsBase minus the
// SDK-only `betas`, `user_profile_id`, `workspace_id`, which the SDK moves into headers).
const BODY_KEYS = new Set([
  'model', 'max_tokens', 'messages', 'stream', 'system', 'tools', 'tool_choice', 'thinking', 'output_config',
  'cache_control', 'metadata', 'stop_sequences', 'fallbacks', 'context_management', 'service_tier', 'speed',
  'inference_geo', 'container', 'mcp_servers', 'diagnostics', 'billing_policy', 'compaction',
  'fallback_credit_token', 'thread',
]);

export class ApiError {
  constructor(status, type, message) {
    this.status = status;
    this.type = type;
    this.message = message;
  }
}
const bad = (message) => new ApiError(400, 'invalid_request_error', message);

/** Lower-cased header object → { error } | { scheme, betas } (never returns the key itself). */
export function validateHeaders(h) {
  const apiKey = typeof h['x-api-key'] === 'string' ? h['x-api-key'].trim() : '';
  const auth = typeof h.authorization === 'string' ? h.authorization.trim() : '';
  let key = '';
  let scheme = 'none';
  if (apiKey) {
    key = apiKey;
    scheme = 'x-api-key';
  } else if (/^bearer\s+\S/i.test(auth)) {
    // SDK 1.10.0 sends the key as "Authorization: Bearer <key>"; older SDKs used x-api-key.
    key = auth.replace(/^bearer\s+/i, '').trim();
    scheme = 'bearer';
  }
  if (!key) return { error: new ApiError(401, 'authentication_error', 'x-api-key header is required'), scheme };
  if (!key.startsWith('sk-ant-') || key.includes('-bad')) {
    return { error: new ApiError(401, 'authentication_error', 'invalid x-api-key'), scheme };
  }
  const version = typeof h['anthropic-version'] === 'string' ? h['anthropic-version'].trim() : '';
  if (!version) return { error: bad('anthropic-version: header is required'), scheme };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) return { error: bad(`anthropic-version: invalid version \`${version}\``), scheme };
  if (h.origin !== undefined && h['anthropic-dangerous-direct-browser-access'] !== 'true') {
    return {
      error: new ApiError(
        401,
        'authentication_error',
        'CORS requests must set the "anthropic-dangerous-direct-browser-access" header to "true" to call the API directly from a browser.',
      ),
      scheme,
    };
  }
  const betas = String(h['anthropic-beta'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = betas.filter((b) => !KNOWN_BETAS.has(b));
  if (unknown.length) {
    return {
      error: bad(`Unexpected value(s) \`${unknown.join(', ')}\` for the \`anthropic-beta\` header. Please consult our documentation at docs.claude.com or try again without the header.`),
      scheme,
    };
  }
  return { error: null, scheme, betas: new Set(betas) };
}

function extraKeys(obj, allowed, path) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return bad(`${path}${path ? '.' : ''}${key}: Extra inputs are not permitted`);
  }
  return null;
}
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const nonBlank = (s) => typeof s === 'string' && s.trim().length > 0;

function checkCacheControl(cc, path) {
  if (cc === undefined || cc === null) return null;
  if (!isPlainObject(cc) || cc.type !== 'ephemeral') return bad(`${path}.type: Input should be 'ephemeral'`);
  if (cc.ttl !== undefined && cc.ttl !== null && cc.ttl !== '5m' && cc.ttl !== '1h') return bad(`${path}.ttl: Input should be '5m' or '1h'`);
  return extraKeys(cc, new Set(['type', 'ttl']), path);
}

/**
 * Validate the parsed body. `betas` is the Set of anthropic-beta values.
 * Returns an ApiError or null. The checks run in a fixed order and report the first problem.
 */
export function validateBody(body, betas = new Set()) {
  if (!isPlainObject(body)) return bad('Request body must be a JSON object.');

  for (const key of ['temperature', 'top_p', 'top_k']) {
    if (key in body) return bad(`${key}: \`${key}\` is not supported on this API version or model. Remove the parameter.`);
  }
  for (const key of Object.keys(body)) {
    if (!BODY_KEYS.has(key)) return bad(`${key}: Extra inputs are not permitted`);
  }

  for (const key of ['model', 'max_tokens', 'messages']) {
    if (body[key] === undefined) return bad(`${key}: Field required`);
  }
  if (typeof body.model !== 'string') return bad('model: Input should be a valid string');
  if (!MODEL_IDS.includes(body.model)) return new ApiError(404, 'not_found_error', `model: ${body.model}`);
  if (!isInt(body.max_tokens)) return bad('max_tokens: Input should be a valid integer');
  if (body.max_tokens < 1) return bad('max_tokens: Input should be greater than or equal to 1');
  if (body.max_tokens > MAX_TOKENS_LIMIT) {
    return bad(`max_tokens: ${body.max_tokens} > ${MAX_TOKENS_LIMIT}, which is the maximum allowed number of output tokens for ${body.model}`);
  }
  if (body.stream !== undefined && typeof body.stream !== 'boolean') return bad('stream: Input should be a valid boolean');

  let err = validateSystem(body.system);
  if (err) return err;
  err = validateThinking(body.thinking, betas);
  if (err) return err;
  err = validateOutputConfig(body.output_config);
  if (err) return err;
  err = validateToolChoice(body.tool_choice);
  if (err) return err;
  err = validateTools(body.tools);
  if (err) return err;
  err = checkCacheControl(body.cache_control, 'cache_control');
  if (err) return err;

  if (body.metadata !== undefined) {
    if (!isPlainObject(body.metadata)) return bad('metadata: Input should be a valid dictionary');
    err = extraKeys(body.metadata, new Set(['user_id']), 'metadata');
    if (err) return err;
  }
  if (body.stop_sequences !== undefined) {
    if (!Array.isArray(body.stop_sequences) || body.stop_sequences.some((s) => typeof s !== 'string')) {
      return bad('stop_sequences: Input should be a valid list of strings');
    }
  }

  if (body.fallbacks !== undefined && body.fallbacks !== null) {
    if (!betas.has(BETA_FALLBACKS) && !betas.has('server-side-fallback-2026-06-01')) {
      return bad(`fallbacks: Extra inputs are not permitted (server-side fallback requires the anthropic-beta header \`${BETA_FALLBACKS}\`)`);
    }
    if (body.model === 'claude-haiku-5-5') return bad('fallbacks: server-side fallback is not supported for claude-haiku-5-5');
    if (body.fallbacks !== 'default') {
      if (!Array.isArray(body.fallbacks) || body.fallbacks.length === 0) return bad('fallbacks: Input should be "default" or a non-empty list of fallback entries');
      for (let i = 0; i < body.fallbacks.length; i++) {
        const f = body.fallbacks[i];
        if (!isPlainObject(f) || typeof f.model !== 'string') return bad(`fallbacks.${i}.model: Field required`);
        if (!MODEL_IDS.includes(f.model)) return new ApiError(404, 'not_found_error', `fallbacks.${i}.model: ${f.model}`);
      }
    }
  }

  if (body.context_management !== undefined && body.context_management !== null) {
    const cm = body.context_management;
    if (!isPlainObject(cm)) return bad('context_management: Input should be a valid dictionary');
    err = extraKeys(cm, new Set(['edits']), 'context_management');
    if (err) return err;
    const edits = cm.edits ?? [];
    if (!Array.isArray(edits)) return bad('context_management.edits: Input should be a valid list');
    for (let i = 0; i < edits.length; i++) {
      const e = edits[i];
      const path = `context_management.edits.${i}`;
      if (!isPlainObject(e)) return bad(`${path}: Input should be a valid dictionary`);
      if (e.type === 'compact_20260112') {
        if (!betas.has(BETA_COMPACT)) {
          return bad(`${path}: compaction (compact_20260112) requires the anthropic-beta header \`${BETA_COMPACT}\``);
        }
        err = extraKeys(e, new Set(['type', 'instructions', 'pause_after_compaction', 'trigger']), path);
        if (err) return err;
      } else if (e.type === 'clear_tool_uses_20250919' || e.type === 'clear_thinking_20251015') {
        if (!betas.has(BETA_CONTEXT_MANAGEMENT)) {
          return bad(`${path}: ${e.type} requires the anthropic-beta header \`${BETA_CONTEXT_MANAGEMENT}\``);
        }
      } else {
        return bad(`${path}.type: Input tag '${e.type}' found using 'type' does not match any of the expected tags`);
      }
    }
  }

  return validateMessages(body);
}

function validateSystem(system) {
  if (system === undefined || system === null) return null;
  if (typeof system === 'string') return null;
  if (!Array.isArray(system)) return bad('system: Input should be a valid string or list of text blocks');
  for (let i = 0; i < system.length; i++) {
    const b = system[i];
    const path = `system.${i}`;
    if (!isPlainObject(b) || b.type !== 'text') return bad(`${path}.type: Input should be 'text'`);
    if (!nonBlank(b.text)) return bad(`${path}.text: text content blocks must contain non-whitespace text`);
    const err = extraKeys(b, new Set(['type', 'text', 'cache_control', 'citations']), path) || checkCacheControl(b.cache_control, `${path}.cache_control`);
    if (err) return err;
  }
  return null;
}

function validateThinking(thinking, betas) {
  if (thinking === undefined) return null;
  if (!isPlainObject(thinking)) return bad('thinking: Input should be a valid dictionary');
  if (thinking.type === 'disabled' || thinking.type === 'enabled') {
    return bad(`"thinking.type.${thinking.type}" is not supported for this model. Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.`);
  }
  if (thinking.type !== 'adaptive') {
    return bad(`thinking.type: Input tag '${thinking.type}' found using 'type' does not match any of the expected tags: 'adaptive'`);
  }
  if ('budget_tokens' in thinking) {
    return bad('thinking.adaptive.budget_tokens: Extra inputs are not permitted. budget_tokens is not supported for this model; use output_config.effort.');
  }
  if ('block_binding' in thinking && !betas.has(BETA_BINDING)) return bad('thinking.adaptive.block_binding: Extra inputs are not permitted');
  const err = extraKeys(thinking, new Set(['type', 'display', 'block_binding']), 'thinking.adaptive');
  if (err) return err;
  if (thinking.display !== undefined && thinking.display !== null && !THINKING_DISPLAYS.includes(thinking.display)) {
    return bad(`thinking.adaptive.display: Input should be ${THINKING_DISPLAYS.map((d) => `'${d}'`).join(', ')}`);
  }
  return null;
}

function validateOutputConfig(oc) {
  if (oc === undefined) return null;
  if (!isPlainObject(oc)) return bad('output_config: Input should be a valid dictionary');
  const err = extraKeys(oc, new Set(['effort', 'format', 'task_budget']), 'output_config');
  if (err) return err;
  if (oc.effort !== undefined && oc.effort !== null && !EFFORTS.includes(oc.effort)) {
    return bad(`output_config.effort: Input should be ${EFFORTS.map((e) => `'${e}'`).join(', ')}`);
  }
  if (oc.format !== undefined && oc.format !== null) {
    const f = oc.format;
    if (!isPlainObject(f) || f.type !== 'json_schema') return bad("output_config.format.type: Input should be 'json_schema'");
    const fe = extraKeys(f, new Set(['type', 'schema']), 'output_config.format');
    if (fe) return fe;
    if (!isPlainObject(f.schema)) return bad('output_config.format.schema: Field required');
    return validateOutputSchema(f.schema, 'output_config.format.schema', f.schema);
  }
  return null;
}

// Structured outputs accept a JSON Schema subset: exactly the keywords the SDK's own
// transformJSONSchema() keeps (everything else it folds into `description`, because the API
// rejects it): no numeric/string-length limits, no maxItems, minItems only 0 or 1, and every
// object must set additionalProperties: false.
const SCHEMA_STRING_FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid']);
const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const SCHEMA_COMMON = ['type', 'description', 'title', 'enum', 'const', 'anyOf', 'allOf', '$ref', '$defs', '$schema'];
const SCHEMA_BY_TYPE = {
  object: ['properties', 'required', 'additionalProperties'],
  array: ['items', 'minItems'],
  string: ['format'],
};
const isPrimitiveValue = (v) => v === null || typeof v !== 'object';

function validateOutputSchema(node, path, root, depth = 0) {
  if (depth > 32) return bad(`${path}: schema is nested too deeply`);
  if (!isPlainObject(node)) return bad(`${path}: Input should be a valid JSON Schema object`);
  const types = Array.isArray(node.type) ? node.type : node.type === undefined ? [] : [node.type];
  for (const t of types) if (!SCHEMA_TYPES.has(t)) return bad(`${path}.type: unsupported type ${JSON.stringify(t)}`);
  const allowed = new Set([...SCHEMA_COMMON, ...types.flatMap((t) => SCHEMA_BY_TYPE[t] || [])]);
  for (const key of Object.keys(node)) {
    if (!allowed.has(key)) {
      return bad(`${path}: JSON Schema keyword \`${key}\` is not supported in structured outputs${types.length ? ` for type ${types.join('|')}` : ''}. Remove it (state the constraint in the description instead).`);
    }
  }
  const hasLiteral = node.enum !== undefined || node.const !== undefined;
  if (!types.length && !hasLiteral && !node.anyOf && !node.allOf && !node.$ref) return bad(`${path}: a schema must define \`type\` (or use anyOf, allOf, enum, const or $ref)`);
  if (node.enum !== undefined && (!Array.isArray(node.enum) || !node.enum.length || !node.enum.every(isPrimitiveValue))) return bad(`${path}.enum: must be a non-empty list of primitive values`);
  if (node.const !== undefined && !isPrimitiveValue(node.const)) return bad(`${path}.const: must be a primitive value`);
  if (node.$ref !== undefined) {
    const m = typeof node.$ref === 'string' && node.$ref.match(/^#\/\$defs\/([^/]+)$/);
    if (!m || !isPlainObject(root.$defs?.[m[1]])) return bad(`${path}.$ref: must reference a definition in #/$defs`);
  }
  for (const key of ['anyOf', 'allOf']) {
    if (node[key] === undefined) continue;
    if (!Array.isArray(node[key]) || !node[key].length) return bad(`${path}.${key}: must be a non-empty list of schemas`);
    for (let i = 0; i < node[key].length; i++) {
      const e = validateOutputSchema(node[key][i], `${path}.${key}.${i}`, root, depth + 1);
      if (e) return e;
    }
  }
  if (node.$defs !== undefined) {
    if (!isPlainObject(node.$defs)) return bad(`${path}.$defs: must be an object`);
    for (const [name, def] of Object.entries(node.$defs)) {
      const e = validateOutputSchema(def, `${path}.$defs.${name}`, root, depth + 1);
      if (e) return e;
    }
  }
  if (types.includes('object')) {
    if (node.additionalProperties !== false) {
      return bad(`${path}: for 'object' type, 'additionalProperties' must be explicitly set to false`);
    }
    const props = node.properties ?? {};
    if (!isPlainObject(props)) return bad(`${path}.properties: must be an object`);
    for (const [name, sub] of Object.entries(props)) {
      const e = validateOutputSchema(sub, `${path}.properties.${name}`, root, depth + 1);
      if (e) return e;
    }
    if (node.required !== undefined) {
      if (!Array.isArray(node.required) || node.required.some((r) => typeof r !== 'string' || !(r in props))) {
        return bad(`${path}.required: must list property names defined in properties`);
      }
    }
  }
  if (types.includes('array')) {
    if (node.items !== undefined) {
      const e = validateOutputSchema(node.items, `${path}.items`, root, depth + 1);
      if (e) return e;
    }
    if (node.minItems !== undefined && node.minItems !== 0 && node.minItems !== 1) {
      return bad(`${path}.minItems: only 0 or 1 is supported in structured outputs (got ${JSON.stringify(node.minItems)})`);
    }
  }
  if (types.includes('string') && node.format !== undefined && !SCHEMA_STRING_FORMATS.has(node.format)) {
    return bad(`${path}.format: unsupported string format ${JSON.stringify(node.format)}`);
  }
  return null;
}

function validateToolChoice(tc) {
  if (tc === undefined) return null;
  if (!isPlainObject(tc)) return bad('tool_choice: Input should be a valid dictionary');
  if (tc.type === 'any' || tc.type === 'tool') return bad('tool_choice: type "tool" and "any" are not supported for this model.');
  if (tc.type !== 'auto' && tc.type !== 'none') {
    return bad(`tool_choice.type: Input tag '${tc.type}' found using 'type' does not match any of the expected tags: 'auto', 'none'`);
  }
  if (tc.disable_parallel_tool_use !== undefined && typeof tc.disable_parallel_tool_use !== 'boolean') {
    return bad('tool_choice.disable_parallel_tool_use: Input should be a valid boolean');
  }
  return extraKeys(tc, new Set(['type', 'disable_parallel_tool_use']), 'tool_choice');
}

const CUSTOM_TOOL_KEYS = new Set([
  'type', 'name', 'description', 'input_schema', 'eager_input_streaming', 'strict', 'cache_control',
  'input_examples', 'defer_loading', 'allowed_callers',
]);

function validateTools(tools) {
  if (tools === undefined) return null;
  if (!Array.isArray(tools)) return bad('tools: Input should be a valid list');
  const names = new Set();
  for (let i = 0; i < tools.length; i++) {
    const t = tools[i];
    const path = `tools.${i}`;
    if (!isPlainObject(t)) return bad(`${path}: Input should be a valid dictionary`);
    let err;
    if (t.type !== undefined && t.type !== null && t.type !== 'custom') {
      const expectedName = SERVER_TOOLS[t.type];
      if (!expectedName) {
        return bad(`${path}: Input tag '${t.type}' found using 'type' does not match any of the expected tags (this API accepts server tools web_search_20260209 and web_fetch_20260209)`);
      }
      if (t.name !== expectedName) return bad(`${path}.${t.type}.name: Input should be '${expectedName}'`);
      // Exactly { type, name } plus an optional max_uses (cache_control is cache metadata).
      err = extraKeys(t, new Set(['type', 'name', 'max_uses', 'cache_control']), `${path}.${t.type}`);
      if (err) return err;
      if (t.max_uses !== undefined && t.max_uses !== null && (!isInt(t.max_uses) || t.max_uses < 1)) {
        return bad(`${path}.${t.type}.max_uses: Input should be a positive integer`);
      }
      err = checkCacheControl(t.cache_control, `${path}.${t.type}.cache_control`);
      if (err) return err;
    } else {
      if (typeof t.name !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(t.name)) {
        return bad(`${path}.custom.name: String should match pattern '^[a-zA-Z0-9_-]{1,128}$'`);
      }
      err = extraKeys(t, CUSTOM_TOOL_KEYS, `${path}.custom`);
      if (err) return err;
      if (!isPlainObject(t.input_schema)) return bad(`${path}.custom.input_schema: Field required`);
      if (t.input_schema.type !== 'object') return bad(`${path}.custom.input_schema.type: Input should be 'object'`);
      if (t.description !== undefined && typeof t.description !== 'string') return bad(`${path}.custom.description: Input should be a valid string`);
      if (t.eager_input_streaming !== undefined && t.eager_input_streaming !== null && typeof t.eager_input_streaming !== 'boolean') {
        return bad(`${path}.custom.eager_input_streaming: Input should be a valid boolean`);
      }
      err = checkCacheControl(t.cache_control, `${path}.custom.cache_control`);
      if (err) return err;
    }
    if (names.has(t.name)) return bad(`tools: Tool names must be unique. Duplicate name: ${t.name}`);
    names.add(t.name);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Messages

const USER_BLOCK_TYPES = new Set(['text', 'image', 'document', 'search_result', 'tool_result']);
const ASSISTANT_BLOCK_TYPES = new Set([
  'text', 'thinking', 'redacted_thinking', 'tool_use', 'server_tool_use', 'web_search_tool_result',
  'web_fetch_tool_result', 'fallback', 'compaction',
]);
const RESULT_FOR = { web_search_tool_result: 'web_search', web_fetch_tool_result: 'web_fetch' };

/**
 * Merge consecutive same-role messages the way the API does. Each merged block remembers where it
 * came from ({ block, msg, idx }); string content becomes one text block.
 */
export function mergeTurns(messages) {
  const turns = [];
  messages.forEach((m, msg) => {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    const entries = blocks.map((block, idx) => ({ block, msg, idx }));
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.entries.push(...entries);
    else turns.push({ role: m.role, entries, firstMsg: msg });
  });
  return turns;
}

const plainTurn = (t) => ({ role: t.role, content: t.entries.map((e) => e.block) });

/**
 * Signature bound to the conversation prefix: system, tools, every earlier turn (merged as the API
 * merges them), the earlier blocks of the same assistant turn, and the thinking text itself.
 */
export function thinkingSignature({ system, tools, turnsBefore, preceding, thinking }) {
  return sha256Hex(canonicalJson({ system, tools, messages: turnsBefore, preceding, thinking: thinking ?? '' }));
}

/**
 * Sign the thinking blocks of a response about to be returned for `body` (mutates `blocks`).
 * The response is appended after body.messages; when the request ends with an assistant message
 * (pause_turn resume) the response continues that assistant turn.
 */
export function signThinkingBlocks(body, blocks) {
  const turns = mergeTurns(body.messages).map(plainTurn);
  let turnsBefore = turns;
  let base = [];
  if (turns.length && turns[turns.length - 1].role === 'assistant') {
    turnsBefore = turns.slice(0, -1);
    base = turns[turns.length - 1].content;
  }
  blocks.forEach((block, k) => {
    if (block.type !== 'thinking') return;
    block.signature = thinkingSignature({
      system: body.system,
      tools: body.tools,
      turnsBefore,
      preceding: [...base, ...blocks.slice(0, k)],
      thinking: block.thinking,
    });
  });
}

function validateBlock(block, role, path) {
  if (!isPlainObject(block)) return bad(`${path}: Input should be a valid dictionary`);
  const type = block.type;
  const allowed = role === 'user' ? USER_BLOCK_TYPES : ASSISTANT_BLOCK_TYPES;
  if (!allowed.has(type)) {
    if (role === 'assistant' && type === 'document') return bad(`${path}: \`document\` blocks are not permitted in \`assistant\` messages`);
    if (typeof type !== 'string') return bad(`${path}.type: Field required`);
    return bad(`${path}.type: \`${type}\` blocks are not permitted in \`${role}\` messages`);
  }
  let err = checkCacheControl(block.cache_control, `${path}.cache_control`);
  if (err) return err;
  switch (type) {
    case 'text':
      err = extraKeys(block, new Set(['type', 'text', 'citations', 'cache_control']), path);
      if (err) return err;
      if (typeof block.text !== 'string') return bad(`${path}.text: Field required`);
      if (!nonBlank(block.text)) return bad(`${path}.text: text content blocks must contain non-whitespace text`);
      if (block.citations !== undefined && block.citations !== null) {
        if (!Array.isArray(block.citations)) return bad(`${path}.citations: Input should be a valid list`);
        if (role === 'user' && block.citations.length) {
          return bad(`${path}.citations: \`text\` blocks with non-empty \`citations\` are not permitted in \`user\` messages`);
        }
        for (let i = 0; i < block.citations.length; i++) {
          const c = block.citations[i];
          if (!isPlainObject(c) || typeof c.type !== 'string') return bad(`${path}.citations.${i}.type: Field required`);
          if (c.type === 'web_search_result_location' && (typeof c.url !== 'string' || typeof c.encrypted_index !== 'string' || typeof c.cited_text !== 'string')) {
            return bad(`${path}.citations.${i}: web_search_result_location citations need url, cited_text and encrypted_index`);
          }
        }
      }
      return null;
    case 'thinking':
      if ('cache_control' in block) return bad(`${path}.cache_control: Thinking blocks cannot be cached directly`);
      err = extraKeys(block, new Set(['type', 'thinking', 'signature']), path);
      if (err) return err;
      if (typeof block.thinking !== 'string') return bad(`${path}.thinking: Field required`);
      if (typeof block.signature !== 'string' || !block.signature) return bad(`${path}.signature: Field required`);
      return null;
    case 'redacted_thinking':
      err = extraKeys(block, new Set(['type', 'data']), path);
      if (err) return err;
      return typeof block.data === 'string' && block.data ? null : bad(`${path}.data: Field required`);
    case 'tool_use':
      err = extraKeys(block, new Set(['type', 'id', 'name', 'input', 'caller', 'cache_control', 'toolset_name']), path);
      if (err) return err;
      if (typeof block.id !== 'string' || !/^toolu_[A-Za-z0-9_-]+$/.test(block.id)) return bad(`${path}.id: String should match pattern '^toolu_[A-Za-z0-9_-]+$'`);
      if (!nonBlank(block.name)) return bad(`${path}.name: Field required`);
      if (!isPlainObject(block.input)) return bad(`${path}.input: Input should be a valid dictionary`);
      return null;
    case 'server_tool_use':
      err = extraKeys(block, new Set(['type', 'id', 'name', 'input', 'caller', 'cache_control']), path);
      if (err) return err;
      if (typeof block.id !== 'string' || !/^srvtoolu_[A-Za-z0-9_-]+$/.test(block.id)) return bad(`${path}.id: String should match pattern '^srvtoolu_[A-Za-z0-9_-]+$'`);
      if (block.name !== 'web_search' && block.name !== 'web_fetch') return bad(`${path}.name: Input should be 'web_search' or 'web_fetch'`);
      if (!isPlainObject(block.input)) return bad(`${path}.input: Input should be a valid dictionary`);
      return null;
    case 'web_search_tool_result': {
      err = extraKeys(block, new Set(['type', 'tool_use_id', 'content', 'caller', 'cache_control']), path);
      if (err) return err;
      if (!nonBlank(block.tool_use_id)) return bad(`${path}.tool_use_id: Field required`);
      const c = block.content;
      if (Array.isArray(c)) {
        for (let i = 0; i < c.length; i++) {
          const r = c[i];
          if (!isPlainObject(r) || r.type !== 'web_search_result' || typeof r.url !== 'string' || typeof r.title !== 'string' || typeof r.encrypted_content !== 'string') {
            return bad(`${path}.content.${i}: web_search_result needs type, url, title and encrypted_content`);
          }
        }
        return null;
      }
      if (isPlainObject(c) && c.type === 'web_search_tool_result_error' && typeof c.error_code === 'string') return null;
      return bad(`${path}.content: Input should be a list of web_search_result blocks or a web_search_tool_result_error`);
    }
    case 'web_fetch_tool_result': {
      err = extraKeys(block, new Set(['type', 'tool_use_id', 'content', 'caller', 'cache_control']), path);
      if (err) return err;
      if (!nonBlank(block.tool_use_id)) return bad(`${path}.tool_use_id: Field required`);
      const c = block.content;
      if (isPlainObject(c) && c.type === 'web_fetch_tool_result_error' && typeof c.error_code === 'string') return null;
      if (isPlainObject(c) && c.type === 'web_fetch_result' && typeof c.url === 'string' && isPlainObject(c.content) && c.content.type === 'document') return null;
      return bad(`${path}.content: Input should be a web_fetch_result (with a document) or a web_fetch_tool_result_error`);
    }
    case 'tool_result': {
      err = extraKeys(block, new Set(['type', 'tool_use_id', 'content', 'is_error', 'cache_control', 'toolset_name']), path);
      if (err) return err;
      if (!nonBlank(block.tool_use_id)) return bad(`${path}.tool_use_id: Field required`);
      if (block.is_error !== undefined && typeof block.is_error !== 'boolean') return bad(`${path}.is_error: Input should be a valid boolean`);
      const c = block.content;
      if (c === undefined || typeof c === 'string') return null;
      if (!Array.isArray(c)) return bad(`${path}.content: Input should be a valid string or list`);
      for (let i = 0; i < c.length; i++) {
        const inner = c[i];
        const ip = `${path}.content.${i}`;
        if (!isPlainObject(inner)) return bad(`${ip}: Input should be a valid dictionary`);
        if (inner.type === 'text') {
          if (!nonBlank(inner.text)) return bad(`${ip}.text: text content blocks must contain non-whitespace text`);
          err = extraKeys(inner, new Set(['type', 'text', 'citations', 'cache_control']), ip);
          if (err) return err;
        } else if (!['image', 'document', 'search_result', 'tool_reference'].includes(inner.type)) {
          return bad(`${ip}.type: \`${inner.type}\` blocks are not permitted in tool_result content`);
        }
      }
      return null;
    }
    case 'image':
    case 'document':
    case 'search_result':
      return isPlainObject(block.source) || type === 'search_result' ? null : bad(`${path}.source: Field required`);
    default:
      return null; // fallback, compaction: opaque blocks the API returned; sent back as-is
  }
}

function validateMessages(body) {
  const { messages } = body;
  if (!Array.isArray(messages)) return bad('messages: Input should be a valid list');
  if (messages.length === 0) return bad('messages: at least one message is required');

  let toolBlocks = 0;
  let cacheBreakpoints = isPlainObject(body.cache_control) ? 1 : 0;
  for (const t of body.tools ?? []) if (isPlainObject(t?.cache_control)) cacheBreakpoints++;
  if (Array.isArray(body.system)) for (const b of body.system) if (isPlainObject(b?.cache_control)) cacheBreakpoints++;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const path = `messages.${i}`;
    if (!isPlainObject(m)) return bad(`${path}: Input should be a valid dictionary`);
    let err = extraKeys(m, new Set(['role', 'content']), path);
    if (err) return err;
    if (m.role !== 'user' && m.role !== 'assistant') return bad(`${path}.role: Input should be 'user' or 'assistant'`);
    if (typeof m.content === 'string') {
      if (!nonBlank(m.content)) return bad(`${path}.content: text content blocks must contain non-whitespace text`);
      continue;
    }
    if (!Array.isArray(m.content)) return bad(`${path}.content: Input should be a valid string or list of content blocks`);
    if (m.content.length === 0) return bad(`${path}: all messages must have non-empty content except for the optional final assistant message`);
    for (let j = 0; j < m.content.length; j++) {
      const block = m.content[j];
      err = validateBlock(block, m.role, `${path}.content.${j}`);
      if (err) return err;
      if (block.type === 'tool_use' || block.type === 'tool_result') toolBlocks++;
      if (isPlainObject(block.cache_control)) cacheBreakpoints++;
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        for (const inner of block.content) if (isPlainObject(inner?.cache_control)) cacheBreakpoints++;
      }
    }
  }
  if (messages[0].role !== 'user') return bad('messages: first message must use the "user" role');
  if (toolBlocks > 0 && !(Array.isArray(body.tools) && body.tools.length > 0)) {
    return bad('Requests which include `tool_use` or `tool_result` blocks must define tools.');
  }
  if (cacheBreakpoints > 4) return bad(`A maximum of 4 blocks with cache_control may be provided. Found ${cacheBreakpoints}.`);

  // Structure across (merged) turns.
  const turns = mergeTurns(messages);
  const seenToolUseIds = new Set();
  const seenServerIds = new Set();
  for (let ti = 0; ti < turns.length; ti++) {
    const turn = turns[ti];
    const isLast = ti === turns.length - 1;
    const where = (e) => `messages.${e.msg}.content.${e.idx}`;
    if (turn.role === 'assistant') {
      const pending = new Map(); // server tool use id -> { name, entry }
      const clientIds = [];
      for (const e of turn.entries) {
        const b = e.block;
        if (b.type === 'tool_use') {
          if (seenToolUseIds.has(b.id)) return bad(`${where(e)}.id: \`tool_use\` ids must be unique (duplicate ${b.id})`);
          seenToolUseIds.add(b.id);
          clientIds.push(b.id);
        } else if (b.type === 'server_tool_use') {
          if (seenServerIds.has(b.id)) return bad(`${where(e)}.id: \`server_tool_use\` ids must be unique (duplicate ${b.id})`);
          seenServerIds.add(b.id);
          pending.set(b.id, { name: b.name, entry: e });
        } else if (RESULT_FOR[b.type]) {
          const use = pending.get(b.tool_use_id);
          if (!use) {
            return bad(`${where(e)}: \`${b.type}\` block references tool_use_id ${b.tool_use_id}, which does not match any preceding \`server_tool_use\` block in this assistant turn`);
          }
          if (use.name !== RESULT_FOR[b.type]) return bad(`${where(e)}: \`${b.type}\` does not match the \`${use.name}\` server_tool_use ${b.tool_use_id}`);
          pending.delete(b.tool_use_id);
        }
      }
      if (pending.size) {
        // Only a server_tool_use that is the very last block of the request is allowed to be
        // unanswered: that is a paused turn being resumed (stop_reason pause_turn).
        const lastEntry = turn.entries[turn.entries.length - 1];
        for (const [id, use] of pending) {
          const resumable = isLast && use.entry === lastEntry && pending.size === 1;
          if (!resumable) {
            return bad(`${where(use.entry)}: \`${use.name}\` server_tool_use ${id} was found without a corresponding \`${use.name}_tool_result\` block`);
          }
        }
      }
      if (clientIds.length) {
        const next = turns[ti + 1];
        if (!next) {
          return bad(`messages.${turn.entries[0].msg}: \`tool_use\` ids were found without \`tool_result\` blocks immediately after: ${clientIds.join(', ')}. Each \`tool_use\` block must have a corresponding \`tool_result\` block in the next message.`);
        }
        const results = [];
        let sawOther = false;
        for (const e of next.entries) {
          if (e.block.type === 'tool_result') {
            if (sawOther) return bad(`${where(e)}: \`tool_result\` blocks must come first in the user message, before any other content`);
            results.push(e);
          } else {
            sawOther = true;
          }
        }
        const answered = new Set();
        for (const e of results) {
          const id = e.block.tool_use_id;
          if (!clientIds.includes(id)) {
            return bad(`${where(e)}: unexpected \`tool_use_id\` found in \`tool_result\` blocks: ${id}. Each \`tool_result\` block must have a corresponding \`tool_use\` block in the previous message.`);
          }
          if (answered.has(id)) return bad(`${where(e)}: duplicate \`tool_result\` for tool_use_id ${id}`);
          answered.add(id);
        }
        const missing = clientIds.filter((id) => !answered.has(id));
        if (missing.length) {
          return bad(`messages.${next.firstMsg}: \`tool_use\` ids were found without \`tool_result\` blocks immediately after: ${missing.join(', ')}. Each \`tool_use\` block must have a corresponding \`tool_result\` block in the next message.`);
        }
      }
      if (isLast) {
        const lastBlock = turn.entries[turn.entries.length - 1].block;
        const pausedResume = lastBlock.type === 'server_tool_use' && pending.has(lastBlock.id);
        if (!pausedResume) {
          return bad('This model does not support assistant message prefill. The conversation must end with a user message.');
        }
      }
    } else {
      const prev = turns[ti - 1];
      const prevIds = new Set(prev && prev.role === 'assistant' ? prev.entries.filter((e) => e.block.type === 'tool_use').map((e) => e.block.id) : []);
      for (const e of turn.entries) {
        if (e.block.type === 'tool_result' && !prevIds.has(e.block.tool_use_id)) {
          return bad(`${where(e)}: unexpected \`tool_use_id\` found in \`tool_result\` blocks: ${e.block.tool_use_id}. Each \`tool_result\` block must have a corresponding \`tool_use\` block in the previous message.`);
        }
      }
    }
  }

  return verifyThinkingSignatures(body, turns);
}

/** History-editing check: every replayed thinking block must still match its prefix. */
function verifyThinkingSignatures(body, turns) {
  const plain = turns.map(plainTurn);
  for (let ti = 0; ti < turns.length; ti++) {
    const turn = turns[ti];
    if (turn.role !== 'assistant') continue;
    for (let k = 0; k < turn.entries.length; k++) {
      const e = turn.entries[k];
      if (e.block.type !== 'thinking') continue;
      const expected = thinkingSignature({
        system: body.system,
        tools: body.tools,
        turnsBefore: plain.slice(0, ti),
        preceding: plain[ti].content.slice(0, k),
        thinking: e.block.thinking,
      });
      if (expected !== e.block.signature) {
        const err = bad(`messages.${e.msg}.content.${e.idx}: thinking block prefix mismatch: earlier history was edited`);
        err.code = 'thinking_prefix_mismatch';
        return err;
      }
    }
  }
  return null;
}
