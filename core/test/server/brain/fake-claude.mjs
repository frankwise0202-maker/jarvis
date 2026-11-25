// A local stand-in for the Claude Messages API, for the brain's tests (never the real API).
// It checks each request the way the real API would for what the brain sends (headers, model, adaptive
// thinking, no sampling parameters, tool versions, pause_turn continuations append-only, the container),
// records it, and answers with Server-Sent Events built from a scripted turn.
//
//   const fake = await startFakeClaude({ script: (body, n) => turn });
//   turn = { blocks: [text('…'), ...search('q', [{ url, title }]), toolUse('report_check', {...})],
//            stop: 'end_turn' | 'pause_turn' | 'tool_use' | 'max_tokens' | 'refusal',
//            usage: { input_tokens, output_tokens, cache_read_input_tokens, ... }, model?, container?,
//            status?: 429 | 500 | 401 ..., errorType?, slowMs?, dropAfter? (cut the stream after N events) }
//   fake.url, fake.requests (each { headers, body, path }), fake.violations, await fake.close()

import http from 'node:http';

let seq = 0;
const id = (p) => `${p}_${(++seq).toString(36).padStart(8, '0')}`;

export const text = (t, citations = []) => ({ type: 'text', text: t, citations });
export const thinking = (t = '') => ({ type: 'thinking', thinking: t, signature: `sig_${id('t')}` });
export function search(query, results) {
  const useId = id('srvtoolu');
  return [
    { type: 'server_tool_use', id: useId, name: 'web_search', input: { query } },
    {
      type: 'web_search_tool_result',
      tool_use_id: useId,
      content: results.map((r) => ({ type: 'web_search_result', url: r.url, title: r.title, encrypted_content: 'ZW5jcnlwdGVk'.repeat(40), page_age: r.pageAge ?? null })),
    },
  ];
}
export const toolUse = (name, input) => ({ type: 'tool_use', id: id('toolu'), name, input });
export const cite = (url, title, citedText = 'quoted text') => ({ type: 'web_search_result_location', url, title, cited_text: citedText, encrypted_index: 'eA==' });

const KNOWN_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const SERVER_TOOL_TYPES = new Set(['web_search_20260209', 'web_fetch_20260209']);

function validate(body, headers, previous) {
  const v = [];
  // SDK 1.x (API version 2026-10-21) sends the API key as Authorization: Bearer; older ones as x-api-key.
  if (!headers['x-api-key'] && !/^Bearer sk-ant-/.test(String(headers.authorization ?? ''))) v.push('missing API key');
  if (headers['x-api-key'] && headers.authorization) v.push('two credentials');
  if (!headers['anthropic-version']) v.push('missing anthropic-version');
  if (!KNOWN_MODELS.has(body.model)) v.push(`unknown model ${body.model}`);
  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1) v.push('max_tokens');
  if (body.stream !== true) v.push('not streaming');
  for (const k of ['temperature', 'top_p', 'top_k']) if (k in body) v.push(`sampling parameter ${k}`);
  if (body.thinking && body.thinking.type !== 'adaptive') v.push(`thinking ${body.thinking.type}`);
  if (body.thinking?.budget_tokens !== undefined) v.push('budget_tokens');
  if (body.tool_choice && body.tool_choice.type !== 'auto' && body.tool_choice.type !== 'none') v.push('forced tool_choice');
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(body.output_config?.effort)) v.push('effort');
  for (const t of body.tools ?? []) {
    if (t.type && !SERVER_TOOL_TYPES.has(t.type)) v.push(`tool type ${t.type}`);
    if (!t.type && (!t.name || !t.input_schema)) v.push('client tool without schema');
  }
  const msgs = body.messages ?? [];
  if (!msgs.length || msgs[0].role !== 'user') v.push('first message must be user');
  if (msgs.at(-1)?.role === 'assistant') {
    // Only a pause_turn continuation may end with the assistant: its last block must be a server tool block.
    const last = msgs.at(-1).content?.at?.(-1);
    if (!last || !['server_tool_use', 'web_search_tool_result', 'web_fetch_tool_result', 'text'].includes(last.type)) v.push('assistant prefill');
  }
  if (previous) {
    // Continuations are append-only: same system, tools and earlier messages.
    if (JSON.stringify(previous.system) !== JSON.stringify(body.system)) v.push('system changed between continuations');
    if (JSON.stringify(previous.tools) !== JSON.stringify(body.tools)) v.push('tools changed between continuations');
    const prefix = JSON.stringify(previous.messages);
    if (JSON.stringify(body.messages.slice(0, previous.messages.length)) !== prefix) v.push('history edited between continuations');
  }
  return v;
}

function* events(turn, model) {
  const usage = { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...(turn.usage ?? {}) };
  const searches = turn.blocks.filter((b) => b.type === 'server_tool_use' && b.name === 'web_search').length;
  yield ['message_start', { type: 'message_start', message: { id: id('msg'), type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.input_tokens, output_tokens: 1, cache_creation_input_tokens: usage.cache_creation_input_tokens, cache_read_input_tokens: usage.cache_read_input_tokens } } }];
  let index = 0;
  for (const b of turn.blocks) {
    if (b.type === 'text') {
      yield ['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }];
      for (let i = 0; i < b.text.length; i += 40) yield ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: b.text.slice(i, i + 40) } }];
      for (const c of b.citations ?? []) yield ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'citations_delta', citation: c } }];
    } else if (b.type === 'thinking') {
      yield ['content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } }];
      if (b.thinking) yield ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: b.thinking } }];
      yield ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: b.signature } }];
    } else if (b.type === 'server_tool_use' || b.type === 'tool_use') {
      yield ['content_block_start', { type: 'content_block_start', index, content_block: { type: b.type, id: b.id, name: b.name, input: {} } }];
      const json = JSON.stringify(b.input);
      for (let i = 0; i < json.length; i += 30) yield ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 30) } }];
    } else {
      yield ['content_block_start', { type: 'content_block_start', index, content_block: b }];
    }
    yield ['content_block_stop', { type: 'content_block_stop', index }];
    index += 1;
  }
  const delta = { stop_reason: turn.stop ?? 'end_turn', stop_sequence: null };
  if (turn.stop === 'refusal') delta.stop_details = { type: 'refusal', category: turn.category ?? 'cyber', explanation: 'declined' };
  if (turn.container) delta.container = { id: turn.container, expires_at: new Date(Date.now() + 3600_000).toISOString() };
  const finalUsage = { output_tokens: usage.output_tokens, input_tokens: usage.input_tokens, server_tool_use: { web_search_requests: searches, web_fetch_requests: 0 } };
  if (turn.iterations) finalUsage.iterations = turn.iterations;
  yield ['message_delta', { type: 'message_delta', delta, usage: finalUsage }];
  yield ['message_stop', { type: 'message_stop' }];
}

export async function startFakeClaude({ script, validKeys = null } = {}) {
  const state = { requests: [], violations: [], script, conversations: new Map() };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const headers = req.headers;
      const url = new URL(req.url, 'http://fake');
      const key = headers['x-api-key'] ?? String(headers.authorization ?? '').replace(/^Bearer\s+/, '');
      if (req.method === 'GET' && url.pathname === '/v1/models') {
        state.requests.push({ path: url.pathname, headers, body: null, key });
        if (validKeys && !validKeys.includes(key)) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-10-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' }));
        return;
      }
      if (req.method !== 'POST' || url.pathname !== '/v1/messages') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'not found' } }));
        return;
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        state.violations.push('bad JSON');
        res.writeHead(400);
        res.end();
        return;
      }
      const convKey = JSON.stringify(body.messages?.[0] ?? null) + body.model;
      const previous = state.conversations.get(convKey) ?? null;
      const v = validate(body, headers, previous && body.messages.length > previous.messages.length ? previous : null);
      if (v.length) state.violations.push(...v.map((x) => `request ${state.requests.length}: ${x}`));
      state.conversations.set(convKey, body);
      const n = state.requests.filter((r) => r.path === '/v1/messages').length;
      state.requests.push({ path: url.pathname, headers, body, key });
      if (validKeys && !validKeys.includes(key)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
        return;
      }
      let turn;
      try {
        turn = await state.script(body, n, headers);
      } catch (err) {
        state.violations.push(`script threw: ${err?.message ?? err}`);
        turn = { status: 500, errorType: "api_error", message: String(err?.message ?? err) };
      }
      if (turn.status) {
        res.writeHead(turn.status, { 'content-type': 'application/json', 'retry-after': '0', ...(turn.headers ?? {}) });
        res.end(JSON.stringify({ type: 'error', error: { type: turn.errorType ?? 'api_error', message: turn.message ?? 'scripted error' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      let i = 0;
      for (const [name, data] of events(turn, turn.model ?? body.model)) {
        if (turn.dropAfter !== undefined && i >= turn.dropAfter) {
          res.destroy();
          return;
        }
        if (res.destroyed) return;
        res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
        i += 1;
        if (turn.slowMs) await new Promise((r) => setTimeout(r, turn.slowMs));
      }
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    get requests() {
      return state.requests;
    },
    get messageRequests() {
      return state.requests.filter((r) => r.path === '/v1/messages');
    },
    get violations() {
      return state.violations;
    },
    setScript(fn) {
      state.script = fn;
    },
    close() {
      server.closeAllConnections?.();
      return new Promise((r) => server.close(() => r()));
    },
  };
}
