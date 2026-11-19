// A scripted mock of the Claude Messages API for Jarvis for Chrome's tests (patterned on the
// app's test/mock: strict validation like the real API, realistic SSE, scripted behaviour).
//
//   const mock = createClaudeMock({ apiKey });
//   mock.script(turns)        a list of turn functions (see below), or one function per request
//   mock.handle(req)          -> Promise<{ status, headers, json } | { status, headers, sse }>
//   mock.fetch(url, init)     an in-process fetch for unit tests (the SDK's `fetch` option)
//   mock.requests / mock.violations / mock.reset()
//
// A turn function receives `ctx` and returns what Claude "says":
//   { update?: 'progress note', say?: 'text before the calls', calls?: [{ name, input, custom? }],
//     answer?: 'final text', stop?: 'pause_turn' | 'refusal' | 'max_tokens' | …, delayMs?,
//     hold?: true (stream never finishes until the client aborts), usage?: { output_tokens } }
// ctx: { body, turn (requests since the owner's last message), results (the last user message's
//   tool results, parsed), all (every tool result in this task so far), ref(pattern) (the ref of
//   the first line in the latest page reads matching pattern), taskText, mock }
//
// Validation (each failure is recorded as a violation, and the hard ones answer 4xx like the API):
// auth and version headers; request shape (adaptive thinking, no sampling params or forced
// tool_choice, one browser_toolset_20260801 entry, strict custom tools); system and tools frozen
// for the whole conversation; append-only history (every earlier request's messages and every
// issued response replayed unchanged, thinking signatures bound to their prefix); no assistant
// prefill (the conversation ends with a user message, except a pause_turn continuation of a
// response this mock issued); every tool_use answered in the next user message with toolset_name
// echoed on member results only; member result blocks limited to text/image/browser_state with
// browser_state's rules; the exact halt text; image size limits.
//
// A scripted error ({ error: { status, type, message, headers? } }) answers like the API: with
// `retryAfter` it carries a retry-after header (and no x-should-retry), like a real 429 or 529.

import { createHash } from 'node:crypto';

export const TEST_API_KEY = 'sk-ant-test-0123456789abcdefghijklmnopqrstuvwxyz';
export const HALT_TEXT = 'Not executed: an earlier action in this turn failed.';
const MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']);
const MEMBERS = new Set(['navigate', 'screenshot', 'zoom', 'left_click', 'right_click', 'middle_click', 'double_click', 'triple_click', 'hover', 'left_click_drag', 'left_mouse_down', 'left_mouse_up', 'mouse_move', 'scroll', 'scroll_to', 'type', 'key', 'hold_key', 'wait', 'read_page', 'find', 'get_page_text', 'form_input', 'file_upload', 'read_console', 'read_network', 'javascript_exec', 'new_tab', 'list_tabs', 'switch_tab', 'close_tab']);
const TAB_MGMT = new Set(['new_tab', 'list_tabs', 'switch_tab', 'close_tab']);
const CONTROL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** JSON with object keys sorted, so equal content compares equal whatever the key order. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))), { once: true });
  });

/** Pixel size of a base64 PNG or JPEG (header only). */
export function imageSize(b64) {
  const buf = Buffer.from(String(b64).slice(0, 87000), 'base64');
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

const textOf = (content) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter((b) => b && b.type === 'text')
          .map((b) => b.text)
          .join('\n')
      : '';

export function createClaudeMock({ apiKey = TEST_API_KEY, log = false } = {}) {
  const mock = {
    requests: [],
    violations: [],
    turns: null,
    convs: new Map(), // conversation key -> { system, tools, lastMessages, issued: Map(sig -> true) }
    seq: 0,
    abortedAt: [],
    rejectBetas: [],
    reset() {
      this.rejectBetas = [];
      this.pausedSigs = new Set();
      this.requests.length = 0;
      this.violations.length = 0;
      this.convs.clear();
      this.turns = null;
      this.abortedAt.length = 0;
    },
    /** turns: array of functions (picked by ctx.turn) or a single function. */
    script(turns) {
      this.turns = turns;
    },
    violation(entry, message, status = 400) {
      const v = { requestId: entry?.id, status, message };
      this.violations.push(v);
      if (log) console.warn(`[mock] violation: ${message}`);
      return v;
    },
    handle: (req) => handle(mock, req, { apiKey, log }),
    fetch: (url, init = {}) => mockFetch(mock, url, init),
  };
  return mock;
}

// ---------------------------------------------------------------------------------------------

function headersOf(h) {
  const out = {};
  if (!h) return out;
  if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v, k) => (out[k.toLowerCase()] = v));
  else for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  return out;
}

function errorResponse(status, type, message, { retryAfter } = {}) {
  // Errors this mock raises for invalid requests are final (x-should-retry: false). Scripted
  // rate-limit/overload errors look like the API's: a retry-after header, no x-should-retry.
  const headers = { 'content-type': 'application/json', 'request-id': `req_${Date.now()}` };
  if (retryAfter !== undefined) headers['retry-after'] = String(retryAfter);
  else headers['x-should-retry'] = 'false';
  return { status, headers, json: { type: 'error', error: { type, message } } };
}

async function handle(mock, { method = 'GET', url, headers, bodyText = '', signal }, { apiKey, log }) {
  const u = new URL(url, 'http://mock.local');
  const h = headersOf(headers);
  if (u.pathname === '/__mock/requests') return { status: 200, headers: { 'content-type': 'application/json' }, json: mock.requests.map(({ body, ...rest }) => rest) };
  if (u.pathname === '/__mock/violations') return { status: 200, headers: { 'content-type': 'application/json' }, json: mock.violations };
  if (method === 'OPTIONS') return { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' } };
  const auth = h['x-api-key'] || (h.authorization || '').replace(/^Bearer\s+/i, '');
  if (u.pathname === '/v1/models' && method === 'GET') {
    if (auth !== apiKey) return errorResponse(401, 'authentication_error', 'invalid x-api-key');
    return { status: 200, headers: { 'content-type': 'application/json' }, json: { data: [...MODELS].map((id) => ({ id, type: 'model' })), has_more: false } };
  }
  if (u.pathname !== '/v1/messages' || method !== 'POST') return errorResponse(404, 'not_found_error', `Not found: ${method} ${u.pathname}`);

  const entry = { id: ++mock.seq, time: Date.now(), headers: { version: h['anthropic-version'], beta: h['anthropic-beta'] || '', direct: h['anthropic-dangerous-direct-browser-access'] }, aborted: false, status: null, body: null };
  mock.requests.push(entry);
  if (auth !== apiKey) {
    entry.status = 401;
    mock.violation(entry, 'missing or wrong API key', 401);
    return errorResponse(401, 'authentication_error', 'invalid x-api-key');
  }
  const rejected = String(h['anthropic-beta'] || '')
    .split(',')
    .map((b) => b.trim())
    .filter((b) => (mock.rejectBetas || []).includes(b));
  if (rejected.length) {
    // An account without access to a beta (the API's own wording).
    entry.status = 400;
    return errorResponse(400, 'invalid_request_error', `Unexpected value(s) \`${rejected.join(', ')}\` for the \`anthropic-beta\` header. Please consult our documentation at docs.claude.com or try again without the header.`);
  }
  if (!h['anthropic-version']) {
    mock.violation(entry, 'missing anthropic-version header');
    return errorResponse(400, 'invalid_request_error', 'anthropic-version header is required');
  }
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    mock.violation(entry, 'body is not JSON');
    return errorResponse(400, 'invalid_request_error', 'invalid JSON body');
  }
  entry.body = body;
  const problem = validate(mock, entry, body, h);
  if (problem) {
    entry.status = 400;
    return errorResponse(400, 'invalid_request_error', problem);
  }

  const ctx = context(mock, body);
  entry.turn = ctx.turn;
  entry.taskText = ctx.taskText;
  let plan;
  try {
    const fn = Array.isArray(mock.turns) ? mock.turns[ctx.turn] : mock.turns;
    if (typeof fn !== 'function') throw new Error(`no scripted turn ${ctx.turn} for task "${ctx.taskText.slice(0, 60)}"`);
    plan = (await fn(ctx)) || { answer: 'Done.' };
  } catch (err) {
    mock.violation(entry, `script error: ${err.message}`, 500);
    return errorResponse(500, 'api_error', `mock script error: ${err.message}`);
  }
  if (plan.error) {
    entry.status = plan.error.status;
    return errorResponse(plan.error.status, plan.error.type || 'api_error', plan.error.message || 'scripted error', { retryAfter: plan.error.retryAfter });
  }
  const frames = buildResponse(mock, body, plan, ctx);
  entry.status = 200;
  entry.stop = frames.stop;
  entry.calls = frames.calls;
  return { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'request-id': `req_${entry.id}` }, sse: { events: frames.events, delayMs: plan.delayMs || 0, chunkDelayMs: plan.chunkDelayMs || 0, hold: !!plan.hold, entry } };
}

// ---------------------------------------------------------------------------------------------
// Validation

function convKey(body) {
  const first = body.messages?.[0];
  return sha(canonical(first?.content ?? ''));
}

function prefixHash(body, upto) {
  return sha(canonical(body.system) + canonical(body.tools) + canonical(body.messages.slice(0, upto)));
}

function contentSig(content) {
  return canonical(content.map((b) => (b.type === 'thinking' ? { ...b, signature: '' } : b)));
}

function validate(mock, entry, body, h) {
  const fail = (msg) => {
    mock.violation(entry, msg);
    return msg;
  };
  if (!MODELS.has(body.model)) return fail(`unknown model ${body.model}`);
  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1) return fail('max_tokens must be a positive integer');
  for (const k of ['temperature', 'top_p', 'top_k']) if (k in body) return fail(`${k} is not accepted`);
  if (!body.thinking || body.thinking.type !== 'adaptive') return fail('thinking must be adaptive');
  if ('budget_tokens' in body.thinking) return fail('budget_tokens is not accepted');
  if (body.thinking.display === 'updates' && !String(h['anthropic-beta'] || '').includes('thinking-display-updates-2026-08-18')) return fail('display "updates" needs its beta header');
  if (body.tool_choice && (body.tool_choice.type === 'any' || body.tool_choice.type === 'tool')) return fail('forced tool_choice is not supported for this model');
  if (!body.cache_control || body.cache_control.type !== 'ephemeral') mock.violation(entry, 'no top-level cache_control (prompt caching)', 0);
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages[0].role !== 'user') return fail('messages must start with a user message');
  // No prefill: models with adaptive thinking reject a final assistant turn, unless it is the
  // response of a pause_turn being continued (sent back unchanged).
  const lastMsg = body.messages[body.messages.length - 1];
  if (lastMsg.role === 'assistant') {
    const issued = mock.pausedSigs || new Set();
    const blocks = Array.isArray(lastMsg.content) ? lastMsg.content : [];
    if (!issued.has(contentSig(blocks))) return fail('This model does not support assistant message prefill. The conversation must end with a user message.');
  }
  if (!Array.isArray(body.tools)) return fail('tools are required');
  const toolsets = body.tools.filter((t) => t.type === 'browser_toolset_20260801');
  if (toolsets.length !== 1) return fail('exactly one browser_toolset_20260801 entry expected');
  const ts = toolsets[0];
  if ('name' in ts || 'strict' in ts || 'defer_loading' in ts || 'input_examples' in ts) return fail('the toolset entry takes no name/strict/defer_loading/input_examples');
  for (const [k, v] of Object.entries(ts.configs || {})) {
    if (!MEMBERS.has(k)) return fail(`configs key ${k} is not a member`);
    for (const f of Object.keys(v || {})) if (f !== 'enabled' && f !== 'defer_loading') return fail(`configs.${k}.${f} is not accepted`);
  }
  for (const t of body.tools) {
    if (t.type === 'browser_toolset_20260801') continue;
    if (!t.name || !t.input_schema || t.name === 'browser') return fail(`bad custom tool ${t.name}`);
  }

  // Frozen prefix and append-only history.
  const key = convKey(body);
  let conv = mock.convs.get(key);
  if (!conv) {
    conv = { system: canonical(body.system), tools: canonical(body.tools), lastMessages: null, issued: new Map() };
    mock.convs.set(key, conv);
  } else {
    if (canonical(body.system) !== conv.system) return fail('system prompt changed within a conversation');
    if (canonical(body.tools) !== conv.tools) return fail('tools changed within a conversation');
    if (conv.lastMessages) {
      for (let i = 0; i < conv.lastMessages.length; i++) {
        if (canonical(body.messages[i]) !== canonical(conv.lastMessages[i])) return fail(`history is not append-only: message ${i} changed or went missing`);
      }
    }
  }
  // Every assistant message must be a response this mock issued, replayed unchanged after the
  // same prefix (preserved thinking's prefix check).
  for (let i = 0; i < body.messages.length; i++) {
    const m = body.messages[i];
    if (m.role !== 'assistant') continue;
    const blocks = Array.isArray(m.content) ? m.content : [];
    const thinking = blocks.filter((b) => b.type === 'thinking');
    for (const t of thinking) {
      const expected = `sig_${sha(prefixHash(body, i) + contentSig(blocks)).slice(0, 40)}`;
      if (t.signature !== expected) return fail(`thinking block in message ${i} does not match its conversation prefix (edited history?)`);
    }
    for (const b of blocks) if (b.type === 'tool_use' && b.toolset_name && b.toolset_name !== 'browser') return fail('unknown toolset_name');
  }
  // Tool pairing and member results.
  for (let i = 0; i < body.messages.length; i++) {
    const m = body.messages[i];
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const uses = m.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) continue;
    const next = body.messages[i + 1];
    if (!next) continue; // the response being continued (pause_turn) or the last one
    if (next.role !== 'user' || !Array.isArray(next.content)) return fail(`tool_use in message ${i} is not answered`);
    const results = next.content.filter((b) => b.type === 'tool_result');
    const ids = new Set(results.map((r) => r.tool_use_id));
    for (const u of uses) if (!ids.has(u.id)) return fail(`tool_use ${u.id} (${u.name}) has no tool_result`);
    if (results.length !== uses.length) return fail('tool_result count does not match the tool_use blocks');
    let sawError = false;
    for (const u of uses) {
      const r = results.find((x) => x.tool_use_id === u.id);
      const member = u.toolset_name === 'browser';
      if (member && r.toolset_name !== 'browser') return fail(`result for member ${u.name} must echo toolset_name "browser"`);
      if (!member && 'toolset_name' in r) return fail(`result for custom tool ${u.name} must not carry toolset_name`);
      if (member) {
        const err = checkMemberResult(u, r, sawError);
        if (err) return fail(err);
      }
      if (r.is_error) sawError = true;
    }
  }
  // Images.
  let images = 0;
  const all = [];
  for (const m of body.messages) {
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b.type === 'tool_result' && Array.isArray(b.content)) for (const c of b.content) if (c.type === 'image') all.push(c);
      if (b.type === 'image') all.push(b);
    }
  }
  images = all.length;
  for (const img of all) {
    const size = imageSize(img.source?.data || '');
    if (!size) return fail('an image is not a valid PNG or JPEG');
    if (Math.max(size.w, size.h) > 2576 || Math.ceil(size.w / 28) * Math.ceil(size.h / 28) > 4784) return fail(`image ${size.w}x${size.h} is over the toolset image limits`);
    if (images > 20 && Math.max(size.w, size.h) > 2000) return fail(`image ${size.w}x${size.h} is over the many-image limit`);
  }
  conv.lastMessages = body.messages;
  return null;
}

function checkMemberResult(use, r, afterError) {
  // The halt rule: after a failed call, every later call in the batch is answered, not run, with
  // the toolset's exact halt text.
  if (afterError && (!r.is_error || textOf(r.content) !== HALT_TEXT)) return `call ${use.name} after a failed call must get the exact halt text`;
  if (r.is_error) {
    const blocks = Array.isArray(r.content) ? r.content : [];
    if (blocks.some((b) => b.type === 'browser_state')) return `error result for ${use.name} must not carry browser_state`;
    return null;
  }
  const blocks = Array.isArray(r.content) ? r.content : [{ type: 'text', text: String(r.content) }];
  for (const b of blocks) if (!['text', 'image', 'browser_state'].includes(b.type)) return `member result for ${use.name} has a ${b.type} block`;
  const states = blocks.filter((b) => b.type === 'browser_state');
  if (states.length > 1) return `member result for ${use.name} has more than one browser_state`;
  if (TAB_MGMT.has(use.name) && (blocks.length !== 1 || states.length !== 1)) return `${use.name} result must be exactly one browser_state block`;
  if ((use.name === 'screenshot' || use.name === 'zoom') && !blocks.some((b) => b.type === 'image')) return `${use.name} result needs an image`;
  const st = states[0];
  if (st) {
    if (!Array.isArray(st.tabs)) return 'browser_state.tabs must be an array';
    const ids = new Set();
    let active = 0;
    for (const t of st.tabs) {
      if (!t.tab_id || ids.has(t.tab_id)) return 'browser_state has an empty or duplicate tab_id';
      ids.add(t.tab_id);
      for (const f of ['tab_id', 'title', 'url']) if (typeof t[f] !== 'string' || t[f].length > 4096 || CONTROL.test(t[f])) return `browser_state tab ${f} is invalid`;
      if (t.active) active++;
    }
    if (st.tabs.length && active !== 1) return 'browser_state needs exactly one active tab';
    if ('state_changes' in st) {
      if (!Array.isArray(st.state_changes) || !st.state_changes.length) return 'state_changes must be omitted rather than empty';
      for (const c of st.state_changes) if (c.type === 'tab_opened' && !ids.has(c.tab_id)) return 'tab_opened names a tab that is not in tabs';
    }
    if (use.name === 'new_tab') {
      const opened = (st.state_changes || []).filter((c) => c.type === 'tab_opened');
      const act = st.tabs.find((t) => t.active);
      if (opened.length !== 1 || !act || opened[0].tab_id !== act.tab_id) return 'new_tab needs exactly one tab_opened matching the active tab';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Context for the turn scripts

function parseResult(r, use) {
  const blocks = Array.isArray(r.content) ? r.content : [{ type: 'text', text: String(r.content ?? '') }];
  return {
    id: r.tool_use_id,
    name: use?.name,
    input: use?.input,
    member: r.toolset_name === 'browser',
    isError: !!r.is_error,
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
    images: blocks.filter((b) => b.type === 'image').map((b) => ({ ...imageSize(b.source?.data || ''), mediaType: b.source?.media_type })),
    state: blocks.find((b) => b.type === 'browser_state') || null,
  };
}

function context(mock, body) {
  const msgs = body.messages;
  // The owner's latest message: the last user message with a text block that is not a Jarvis note.
  let ownerIdx = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'user') continue;
    const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
    if (blocks.some((b) => b.type === 'text' && /^\[Context from Jarvis/.test(b.text))) {
      ownerIdx = i;
      break;
    }
  }
  const taskText = textOf(msgs[ownerIdx].content).replace(/^\[Context from Jarvis[^\]]*\]\s*/, '');
  const uses = new Map();
  for (const m of msgs) if (m.role === 'assistant' && Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_use') uses.set(b.id, b);
  const all = [];
  let turn = 0;
  for (let i = ownerIdx + 1; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === 'assistant') turn++;
    if (m.role === 'user' && Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_result') all.push(parseResult(b, uses.get(b.tool_use_id)));
  }
  // The trailing user messages (tool results, then any notes from Jarvis such as a take-over note).
  const results = [];
  const notes = [];
  for (let i = msgs.length - 1; i > ownerIdx && msgs[i].role === 'user'; i--) {
    const blocks = Array.isArray(msgs[i].content) ? msgs[i].content : [];
    results.unshift(...blocks.filter((b) => b.type === 'tool_result').map((b) => parseResult(b, uses.get(b.tool_use_id))));
    notes.unshift(...blocks.filter((b) => b.type === 'text').map((b) => b.text));
  }
  return {
    body,
    turn,
    taskText,
    results,
    notes,
    all,
    mock,
    /** The ref on the first line (latest reads first) matching `pattern`. */
    ref(pattern) {
      const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      for (const r of [...all].reverse()) {
        for (const line of r.text.split('\n')) if (re.test(line)) {
          const m = /\[(ref_\d+)\]/.exec(line);
          if (m) return m[1];
        }
      }
      throw new Error(`no element matching ${re} in the page reads`);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Responses

function estimateTokens(body) {
  let chars = JSON.stringify(body.system).length + 26000; // the toolset definition (~6.6k tokens)
  let imageTokens = 0;
  for (const m of body.messages) {
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b.type === 'tool_result' && Array.isArray(b.content)) {
        for (const c of b.content) {
          if (c.type === 'image') {
            const s = imageSize(c.source.data) || { w: 1000, h: 700 };
            imageTokens += Math.ceil(s.w / 28) * Math.ceil(s.h / 28);
          } else chars += JSON.stringify(c).length;
        }
      } else chars += JSON.stringify(b).length;
    }
    if (typeof m.content === 'string') chars += m.content.length;
  }
  return Math.ceil(chars / 4) + imageTokens;
}

function buildResponse(mock, body, plan, ctx) {
  const id = `msg_${String(++mock.seq).padStart(6, '0')}`;
  const content = [];
  content.push({ type: 'thinking', thinking: '', signature: '' }); // reasoning (display omitted/updates: empty)
  if (plan.update && body.thinking.display === 'updates') content.push({ type: 'thinking', thinking: plan.update, signature: '' });
  if (plan.say) content.push({ type: 'text', text: plan.say });
  let stop = plan.stop || 'end_turn';
  const calls = [];
  for (const c of plan.calls || []) {
    const block = { type: 'tool_use', id: `toolu_${sha(`${id}${calls.length}${Math.random()}`).slice(0, 24)}`, name: c.name, input: c.input || {} };
    if (!c.custom) block.toolset_name = 'browser';
    content.push(block);
    calls.push(c.name);
  }
  if (calls.length && !plan.stop) stop = 'tool_use';
  if (plan.answer) content.push({ type: 'text', text: plan.answer });
  if (stop === 'pause_turn') {
    mock.pausedSigs = mock.pausedSigs || new Set();
    mock.pausedSigs.add(contentSig(content));
  }
  // Bind thinking signatures to this exact conversation prefix.
  const sig = `sig_${sha(prefixHash(body, body.messages.length) + contentSig(content)).slice(0, 40)}`;
  for (const b of content) if (b.type === 'thinking') b.signature = sig;

  const total = estimateTokens(body);
  const conv = mock.convs.get(convKey(body));
  const cached = Math.min(total, conv?.cachedTokens || 0);
  if (conv) conv.cachedTokens = total;
  const usage = { input_tokens: 12, cache_creation_input_tokens: Math.max(0, total - cached - 12), cache_read_input_tokens: cached, output_tokens: 1 };
  const outTokens = plan.usage?.output_tokens ?? 60 + Math.ceil(JSON.stringify(content).length / 4);

  const events = [];
  // `plan.model`: the model that answered (a server-side fallback model answers as another one).
  events.push({ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: plan.model || body.model, content: [], stop_reason: null, stop_sequence: null, usage } });
  content.forEach((b, index) => {
    if (b.type === 'thinking') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: b.thinking } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: b.signature } });
    } else if (b.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      const words = b.text.match(/\S+\s*/g) || [b.text];
      for (let i = 0; i < words.length; i += 4) events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: words.slice(i, i + 4).join('') } });
    } else if (b.type === 'tool_use') {
      const start = { type: 'tool_use', id: b.id, name: b.name, input: {} };
      if (b.toolset_name) start.toolset_name = b.toolset_name;
      events.push({ type: 'content_block_start', index, content_block: start });
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    }
    events.push({ type: 'content_block_stop', index });
  });
  const stopDetails = stop === 'refusal' ? { type: 'refusal', category: 'cyber', explanation: 'scripted refusal' } : null;
  events.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null, ...(stopDetails ? { stop_details: stopDetails } : {}) }, usage: { output_tokens: outTokens } });
  events.push({ type: 'message_stop' });
  return { events, stop, calls, content };
}

function sseChunks(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
}

// ---------------------------------------------------------------------------------------------
// Transports

/** Node http handler: writes a mock response (SSE streamed with the scripted pacing). */
export async function writeResponse(mock, res, out, req) {
  if (out.json !== undefined || !out.sse) {
    res.writeHead(out.status, { 'access-control-allow-origin': '*', ...out.headers });
    res.end(out.json !== undefined ? JSON.stringify(out.json) : undefined);
    return;
  }
  const { events, delayMs, chunkDelayMs, hold, entry } = out.sse;
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      entry.aborted = true;
      entry.abortedAt = Date.now();
      mock.abortedAt.push(entry.abortedAt);
      ac.abort();
    }
  });
  res.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', ...out.headers });
  try {
    // The headers and message_start go out at once (like the API), the rest after the delay.
    const chunks = sseChunks(events);
    res.write(chunks[0]);
    if (delayMs) await sleep(delayMs, ac.signal);
    if (hold) await sleep(10 * 60 * 1000, ac.signal);
    for (const c of chunks.slice(1)) {
      if (chunkDelayMs) await sleep(chunkDelayMs, ac.signal);
      res.write(c);
    }
    res.end();
    entry.endedAt = Date.now();
  } catch {
    if (!res.writableEnded) res.destroy();
  }
}

async function mockFetch(mock, url, init) {
  const method = init.method || 'GET';
  const bodyText = typeof init.body === 'string' ? init.body : init.body ? new TextDecoder().decode(init.body) : '';
  const out = await mock.handle({ method, url: String(url), headers: init.headers, bodyText, signal: init.signal });
  if (!out.sse) return new Response(out.json !== undefined ? JSON.stringify(out.json) : null, { status: out.status, headers: out.headers });
  const { events, delayMs, chunkDelayMs, hold, entry } = out.sse;
  const enc = new TextEncoder();
  const signal = init.signal;
  const stream = new ReadableStream({
    async start(controller) {
      const chunks = sseChunks(events);
      try {
        controller.enqueue(enc.encode(chunks[0]));
        if (delayMs) await sleep(delayMs, signal);
        if (hold) await sleep(10 * 60 * 1000, signal);
        for (const c of chunks.slice(1)) {
          if (chunkDelayMs) await sleep(chunkDelayMs, signal);
          controller.enqueue(enc.encode(c));
        }
        controller.close();
      } catch {
        entry.aborted = true;
        entry.abortedAt = Date.now();
        try {
          controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        } catch {
          /* closed */
        }
      }
    },
  });
  return new Response(stream, { status: 200, headers: out.headers });
}
