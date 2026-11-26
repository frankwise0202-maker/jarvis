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
| `[[hologram:v2/camry]]` / `v2/f150` / `v2/alternator` / `v2/turbofan` / `v2/model3` / `v2/cessna` | the same with a format v2 sample from `fixtures/v2/`, what `show_hologram` version 2 (lead tools V7) writes: the Camry (43 parts: a hull body with 16 panels, real seats), the F-150 (39), the alternator with cut revolve housings (19), the turbofan with twisted loft fan blades (20), a hand-written Tesla Model 3 (14) and Cessna 172 (10) |
| `[[slowbuild]]` (with `[[hologram:…]]`) | the same `show_hologram`, streamed over 12–13 s × `timeScale` (time to speak to the viewer while it builds) |
| `[[hologram:broken]]` | `show_hologram` whose every shape is invalid: Jarvis answers `is_error`, the mock says it couldn't build it |
| `[[hologram:huge]]` | `show_hologram` far beyond every limit (95 parts x 6 shapes, over-long text, an invalid tone on every part; about 140 kB): Jarvis caps and warns, and later requests carry the large input |
| a `Blueprint request` block in the newest `<turn_context>` | `draw_blueprint` once, with the best-matching sample and the requested `for` ids: a part gets `alternator-part.json` (the AA cell's parts get `battery-cutaway.json`); a whole car `camry-assembly.json`, a whole battery `battery-cutaway.json` (`battery-process.json` when the text asks how it is made) |
| `[[blueprint:<sample>]]` | `draw_blueprint` with that sample (`alternator-part`, `battery-cutaway`, `battery-process`, `camry-assembly`) and no `for` |
| `[[open-saved]]` | `open_saved` with the first id of the turn context's "Saved holograms and blueprints" list (`lib_0000000000` when the list is empty, which Jarvis answers with `is_error`) |
| `[[swarm:N]] [[hologram:<sample>]]` | a Blueprint mission: agents first, then `show_hologram`, then a synthesis of the reports (with sources) led by one sentence about the hologram |

Precedence for a new owner message: a `Blueprint request` block, then `[[swarm]]`/`[[waves]]`,
then `[[hologram]]`, `[[blueprint]]`, `[[open-saved]]`, then the other directives.

### Screens (lead tools version 5, v7)

Only when the request defines `open_screen` (new conversations since v7); an older conversation
gets a plain answer. Local screen commands ("float it", "bring it back") never reach the API: these
test the tool path, Jarvis deciding from words the local matcher does not take.

| Directive | What the mock does |
| --- | --- |
| `[[screen]]` | `open_screen` with `{ what: "this", where: "other_screen" }` |
| `[[screen:<what>:<where>]]` / `[[screen:<what>:<where>:<n>]]` | `open_screen` with that `what` (`this`, `hologram`, `blueprint`, `mission`, `answer`, `photo`, `camera`, `link`) and `where` (`other_screen`, `beside`, `window`, `back`), and monitor `n`; a `link` takes the first http(s) URL in the owner's text |

After the `tool_result`, one short sentence read from it: "It's on screen 2, sir.", "It's floating
beside your work, sir.", "Tap “Open on screen 2” and it'll appear, sir." (needs a tap), "Tap Allow
once, and I can use your other screen, sir." (the permission), "It's back on your main screen,
sir.", or "I couldn't do that: …" for an `is_error` result. `[[screen]]` comes after `[[search]]`
in the precedence above.

### Apple Music (lead tools version 6: `find_music`)

In `music.mjs`. Only when the request defines `find_music` (new conversations since Apple Music); an
older conversation gets a plain answer. Local music commands ("play Back in Black") never reach the
API: these test the tool path, Jarvis choosing music himself.

| Directive | What the mock does |
| --- | --- |
| `[[music]]` | `find_music` with the owner's words as the query ("Play Back in Black by AC/DC" → `Back in Black AC/DC`), kind `song`, limit 3 |
| `[[music:<query>]]` / `[[music:album:<query>]]` / `[[music:artist:<name>]]` | that query (and kind) |
| `[[music:recommend]]` | one sentence, then two `find_music` calls in one response: `Riders on the Storm The Doors` (song) and `Come Away With Me Norah Jones` (album) |

After the `tool_result`(s), one sentence read from them: "Here's Back In Black by AC/DC. Tap Open in
Apple Music to play it, or Preview to hear 30 seconds." (spoken: without the Preview part), "For a
rainy Sunday: … and …. Tap Preview to hear a clip, or Open in Apple Music to play one.", or "I
couldn't search Apple Music just now: …" for an `is_error` result. `[[music]]` comes after
`[[screen]]` in the precedence above.

### Optics (lead tools version 5: `pin_labels`, `look_through_camera`), Watch and the live view

In `optics.mjs`. A Look is detected from the request itself: the newest user message carries an
image and its `<turn_context>` has an `Optics frame fN: … W×H pixels` line. The labels are the
synthetic desk scene's objects (`fixtures/optics-scene.json`, written by
`test/e2e/optics-scene.mjs` from the 3D scene the fake camera plays), scaled to the frame, portrait
or landscape, so a correct crop mapping puts every pin on its object. Screen frames get two
screen-style labels. Only tools the request defines are called.

| Directive / trigger | What the mock does |
| --- | --- |
| an Optics frame line + an image (a Look) | a sentence naming the objects, then `pin_labels` on that frame (input streamed in small chunks), then a closing sentence after the result; a plain answer when the conversation has no `pin_labels` (V4 or older) |
| `[[optics:nolabels]]` | a Look answered in words only |
| `[[optics:badframe]]` | `pin_labels` on frame `f99` first; after Jarvis's `is_error` (it names the newest frame) the same labels on the right frame |
| `[[optics:offframe]]` | three labels plus one far outside the frame (Jarvis skips it and says so) |
| `[[optics:look]]` | while the turn context says `Optics: the camera is live`: "Let me take a look.", `look_through_camera`, then `pin_labels` on the frame its result announces |
| *(a conversation with an Optics frame)* "Show me a hologram of the AA battery." | `show_hologram` with the battery sample (the alternator or Camry when named), spoken lines in Voice Mode: Optics' **Hologram of this** |
| *(the same)* "Tell me more." | a longer answer about the scene |
| *(the same)* "What's this part? (the screwdriver you pinned on frame f1, at 466, 810)" | what it is, then `pin_labels` with that one label at that pixel, then "I've marked it on the frame." (Optics' **What's this part?** for a tapped pin) |
| a structured request whose system prompt starts `You are Jarvis Watch` | `{ worth_saying, line, summary }`: the first frame (no previous summary) sets the scene; later ones report that the mug moved and the notebook is gone |
| a structured request whose system prompt starts `You are Jarvis Live view` (v8.0) | `{ summary, worth_saying, line }` with usage, one answer per look: by default the desk, the same desk, the owner holding up an AA battery ("That's a Duracell AA, 1.5 volts.", worth saying), the battery put down (repeated) |

**Live view scripts** (`configureLive(t.mock, { scene, costUsd, delayMs, errors })`, after the
mock's reset, i.e. at the start of an E2E scenario; `mock.state.live`): `scene` is one
`{ summary, worth_saying, line }` per answered look (the last one repeated); `costUsd` sizes each
answer's usage to cost about that on Claude Haiku 5.5 (input tokens at $0.10 per million);
`delayMs` makes every answer wait that long (real milliseconds; a look given up meanwhile is
dropped); `errors` maps a look number (from 1, rate-limited looks included) to
`{ status: 429 | 529, retryAfter? }` (no `retry-after` header when `retryAfter` is left out),
`'refusal'` (`stop_reason: refusal`, no text) or `'cut'` (`max_tokens`, half a JSON). Scripted
errors are not violations. The validator accepts `thinking: { type: 'disabled' }` only on Claude
Haiku 5.5 at effort high or below (with no other keys), as the real API does.

### Voice Mode turns (the spoken reply channel)

A lead request whose newest `<turn_context>` holds the line `Reply channel: spoken` (Voice Mode's
turns, `startTurn({ spoken: true })`) gets replies written for the ear, and its lead responses
stream their text a few words at a time, 50–90 ms apart (a web search or page read takes about a
second), so Voice Mode can start speaking while the reply still arrives. Without the line every
directive behaves as above.

| Directive / trigger | What the mock does on the spoken channel |
| --- | --- |
| *(none)*, `[[search]]`, `[[swarm:N]]`, attachments, `[[memory]]` | two or three plain sentences, a line `---`, then `## Details` with two list items (the details are for the screen and never spoken) |
| `[[search]]`, `[[pause]]`, `[[swarm:N]]` | first say "Let me check the latest on that." (spoken while the tools run) |
| `[[long]]` / `[[xss]]` | the whole guide below the `---` line / every payload below it and one in the spoken part |
| `[[nobreak]]` / `[[longspoken]]` | a spoken reply with no `---` line or details / a spoken part of about 2,000 characters |
| `[[hologram:<sample>]]` | "Pulling up the AA alkaline battery now." before `show_hologram`, then "Here's the AA alkaline battery. Say "expand it", or tap any part." (failed: "I couldn't build that hologram this time. Shall I try again?") |
| a `Blueprint request` block | "Drawing the blueprint of the separator now." before `draw_blueprint`, then "The blueprint of the separator is ready; it's open on your screen. Tap a numbered callout to see that part." |
| `[[open-saved]]` | "Here's your saved hologram of the 2024 Toyota Camry Hybrid; no need to build it again." |
| `[[swarm:N]] [[hologram:<sample>]]` | the hologram line, then a spoken synthesis with its details and sources below `---` |
