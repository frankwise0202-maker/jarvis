# Strict mock Claude API

`anthropic-mock.mjs` is a mock of the Claude Messages API for Jarvis's unit and E2E tests. It
validates every request like the real API (headers, body, models, thinking and effort, tools,
betas, message structure, `tool_use` / `tool_result` pairing for every client tool,
server-tool pairing, pause_turn resumes, containers and the history-editing check), records
violations, and answers with realistic JSON or Server-Sent Events.

- `createMockFetch(options)`: in-process `fetch` for unit tests (no sockets).
- `createMockHandler(options)`: Node `(req, res, next)` handler for `POST /v1/messages` plus the
  control routes `GET /__mock/requests`, `GET /__mock/violations`, `POST /__mock/reset`,
  `GET /__mock/health` (used by `test/server.mjs` and the E2E suite).
- Options: `timeScale` (default `JARVIS_MOCK_TIME_SCALE` or 1; 0 = no delays), `now`, `verbose`.

Requests are classified by `behavior.mjs`: **lead** (its tools include `deploy_agents`),
**worker** (other streaming requests), **structured** (`output_config.format`), **keytest**
(the non-streaming Haiku "Reply with the single word: ready").

## Directives

Responses are scripted by `[[directives]]` anywhere in the newest owner text of the request
(the lead copies the worker directives into agent tasks).

| Directive | What the mock does |
| --- | --- |
| *(none)* | a short direct answer (thinking + text) |
| `[[search]]` | a web search, 3–5 results, and an answer with citations |
| `[[swarm:N]]` | one sentence, then `deploy_agents` with N agents; the next request gets a synthesis naming every agent |
| `[[waves:2]]` | a second wave of 2 agents after the first results |
| `[[pause]]` / `[[workerpause]]` | the lead's / each agent's first response ends with `pause_turn` |
| `[[ratelimit:K]]` | the first K agent requests get 429 (`retry-after: 0`) |
| `[[ratelimit:K:S]]` | the same, with `retry-after: S` seconds |
| `[[otpm:N]]` | an output-tokens-per-minute limit of N: requests whose `max_tokens` exceeds it get the real 429 shape |
| `[[overloaded]]` | the first lead request gets 529 |
| `[[refuse]]` / `[[workerrefuse]]` | `stop_reason: refusal` with `stop_details` (lead / one agent) |
| `[[slow]]` | slow streaming (≈120 ms between lead events, ≈6 s per agent) |
| `[[xss]]` | an answer (and agent reports) full of XSS payloads |
| `[[badtool]]` | an invalid `deploy_agents` input first, a valid one after the error result |
| `[[memory]]` | `update_memory` "Prefers metric units", then a confirmation |
| `[[dropworkers]]` | each agent's first stream is cut mid-way; later attempts succeed |
| `[[droplead]]` / `[[droplead:N]]` | the lead's first response to each request is cut after N frames (default 60: a dropped connection mid-stream); the same request sent again (Resume) succeeds |
| `[[workerfail]]` | one agent always gets a 500 |
| `[[long]]` | a long Markdown answer (headings, table, code, lists, quote) |

### Holograms, blueprints and the saved library (lead tools version 4)

These only call tools the request defines (as the real API does): a conversation frozen with an
older tools version gets a plain answer instead. The samples are the phase A prototypes' realistic
specs in `fixtures/` (shared with the engine and UI tests). Tool input streams in small
`input_json_delta` chunks (about 28 characters) over 2.4–3.6 s × `timeScale`, so the live build is
visible; the answer after the `tool_result` is one or two sentences.

| Directive / trigger | What the mock does |
| --- | --- |
| `[[hologram:battery]]` / `[[hologram:alternator]]` / `[[hologram:camry]]` | a sentence, then `show_hologram` with `fixtures/battery.json` (AA LR6, 9 parts), `alternator.json` (19 parts) or `camry.json` (2024 Camry Hybrid, 43 parts; default) |
| `[[hologram:broken]]` | `show_hologram` whose every shape is invalid: Jarvis answers `is_error`, the mock says it couldn't build it |
| `[[hologram:huge]]` | `show_hologram` far beyond every limit (95 parts x 6 shapes, over-long text, an invalid tone on every part; about 140 kB): Jarvis caps and warns, and later requests carry the large input |
| a `Blueprint request` block in the newest `<turn_context>` | `draw_blueprint` once, with the best-matching sample and the requested `for` ids: a part gets `alternator-part.json` (the AA cell's parts get `battery-cutaway.json`); a whole car `camry-assembly.json`, a whole battery `battery-cutaway.json` (`battery-process.json` when the text asks how it is made) |
| `[[blueprint:<sample>]]` | `draw_blueprint` with that sample (`alternator-part`, `battery-cutaway`, `battery-process`, `camry-assembly`) and no `for` |
| `[[open-saved]]` | `open_saved` with the first id of the turn context's "Saved holograms and blueprints" list (`lib_0000000000` when the list is empty, which Jarvis answers with `is_error`) |
| `[[swarm:N]] [[hologram:<sample>]]` | a Blueprint mission: agents first, then `show_hologram`, then a synthesis of the reports (with sources) led by one sentence about the hologram |

Precedence for a new owner message: a `Blueprint request` block, then `[[swarm]]`/`[[waves]]`,
then `[[hologram]]`, `[[blueprint]]`, `[[open-saved]]`, then the other directives.
