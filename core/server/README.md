# Jarvis Core server

One Node 22 process, `jarvis-core`. It watches the Alienware around the clock, keeps a week of history,
decides whether things are ok, warn or alert, serves the 24/7 dashboard, and answers simple questions about
the machine's health. Since 1.1.0 it is also the home base's **brain**: background research with the owner's
Claude API key, watchers, the morning briefing, spending caps, push notifications and device sync (see "The
brain" below). It listens on **127.0.0.1:8788 only**; other devices reach it through `tailscale serve`.

The system report uses Node built-ins only. The brain has two pinned dependencies, `@anthropic-ai/sdk`
(1.10.0, the app's version) and `web-push` (3.6.7), installed by `npm ci` in `core/` and **imported lazily**:
without `core/node_modules` the Core still starts and serves the system report, the free briefing and sync,
and `GET /api/brain` says `sdk.installed: false`. The senses (opt-in hearing and voice for the phone, see
"Hearing and voice" below) add `kokoro-js` 1.2.1 and `@huggingface/transformers` 3.8.1 (the app's versions;
onnxruntime-node 1.21 comes with them), loaded only inside their own engine processes; without them
`GET /api/senses` says `deps.installed: false`.

```bash
node core/server/main.mjs                  # the live machine
node core/server/main.mjs --fixture warn   # a simulated Alienware (ok | warn | alert | nogpu | offline)
node core/server/main.mjs --once           # print one full report as JSON and exit
node core/server/main.mjs --help
cd core && npm test                        # server tests; npm run test:longrun for 24 simulated hours
```

## How it fits together

```
io/live.mjs ──► collector/collector.mjs  (every 1 s: /proc/stat, meminfo, diskstats, net/dev, loadavg,
   │                                       uptime, hwmon coretemp, cpufreq; processes every 2 s)
   └──────────► collector/pollers.mjs    (nvidia-smi ≤ every 2 s; every 30 s: internet, Claude API,
                                           Jarvis site build, Tailscale; smartctl every 6 h; statfs 10 s)
core.mjs   one tick: sample → snapshot → health.mjs (rules, hysteresis) → events.mjs → history.mjs
           → store.mjs (save every 5 min and on SIGTERM) → listeners (SSE)
http/      server.mjs (routes), access.mjs (who may connect, CORS), sse.mjs, ratelimit.mjs, static.mjs
assistant/ normalize.mjs, intents.mjs, answers.mjs: the local, rule-based status assistant
sim/       simulator.mjs + scenarios.mjs: fixture mode renders real-format /proc, nvidia-smi and tailscale
           output, so the very same collector, rules and API run without the hardware
brain/     index.mjs (createBrain), vault.mjs (the key), spend.mjs + prices.mjs (cost and caps),
           settings.mjs, claude.mjs (the SDK client), tasks.mjs (prompts: research, watcher check,
           briefing), jobs.mjs (the queue), watchers.mjs, briefing.mjs + weather.mjs + rss.mjs +
           homebase.mjs + music.mjs, schedule.mjs (local time, DST), fixture-fetch.mjs
push/      Web Push (VAPID) to the owner's iPhone and Chrome        (brain-io)
sync/      device backups, latest per device + 14 daily snapshots   (brain-io)
http/brain-routes.mjs  the routes of the three above
senses/    index.mjs (createSenses: settings, states, hear, speak), host.mjs (one engine: queue, deadlines,
           idle unload), worker.mjs (the engine process, nice 10), engines.mjs (Whisper, Kokoro), models.mjs
           (pinned models and sizes), wav.mjs, text.mjs; http/senses-routes.mjs: their routes
```

Everything slow or external is asynchronous with a timeout, and never more than one of each check runs at a
time. All buffers are bounded: the history lives in fixed typed arrays (1 h at 1 s, 7 days at 1 min), the
event log keeps 1000 entries, slow SSE clients have frames dropped rather than queued. A 24-hour accelerated
run (`npm run test:longrun`) shows no heap growth.

## Configuration

Defaults, then `~/.config/jarvis-core/config.json` (optional), then environment variables, then flags.

| setting | env / flag | default |
|---|---|---|
| port (always 127.0.0.1) | `JARVIS_CORE_PORT`, `--port` | 8788 |
| data folder | `JARVIS_CORE_DATA_DIR`, `--data-dir` | `~/.local/share/jarvis-core` |
| dashboard folder | `JARVIS_CORE_DASHBOARD_DIR`, `--dashboard-dir` | `core/dashboard` |
| owner's name | `JARVIS_CORE_OWNER`, `--owner` | Frank |
| times and dates (12 or 24 hours, date order; in English) | `JARVIS_CORE_LOCALE`, `--locale` | the system's (`en-US`: 4:47 PM; `en-GB`: 16:47) |
| night dim window (reported to the dashboard) | `JARVIS_CORE_NIGHT`, `--night` | `23:00-07:00` (`off` to disable) |
| fixture scenario | `JARVIS_CORE_FIXTURE`, `--fixture` | none (live) |
| fixture time speed, start time, seed | `JARVIS_CORE_TIME_SCALE`, `JARVIS_CORE_START`, `JARVIS_CORE_SEED` | 1, now, 1 |
| where the brain keeps the API key | `JARVIS_CORE_SECRETS_DIR` | `~/.config/jarvis-core/secrets` |
| a local Claude API stand-in (tests only; loopback addresses only, anything else is refused) | `JARVIS_CORE_CLAUDE_BASE_URL` | `https://api.anthropic.com` |

The config file also takes `thresholds` (e.g. `{"cpuTemp": {"warn": 75}}`), `gpuMissingLevel`
(`warn`, or `ok` to stop warning about a missing NVIDIA driver), `allowedOrigins`, `tailscaleLogins` (limit
which tailnet users may connect) and `smartSudo`. A broken file is reported and ignored.

## API

| | |
|---|---|
| `GET /api/status` | the full snapshot: `host, core, cpu, gpu, memory, disks, network, processes, services, health` |
| `GET /api/history?range=15m\|1h\|6h\|24h\|7d&series=cpu,cpuTemp,…&points=N&agg=avg\|max` | history |
| `GET /api/events?limit=&since=&level=` | the event log, newest first |
| `GET /api/stream` | SSE: `status` (full, on connect, on changes, every 30 s), `tick` (every second: all but `services` and `health.items`), `event` (with `id`; `Last-Event-ID` replays missed ones) |
| `POST /api/ask {"q": "…"}` | `{answer, facts, intent, suggestions}` |
| `GET /api/info` | version, uptimes, Tailscale URL, night window, who you are |
| `GET /api/ping` | liveness |
| `GET /api/fixture`, `POST /api/fixture {"scenario"}` | fixture mode only |
| `/api/brain`, `/api/spend`, `/api/jobs`, `/api/watchers`, `/api/briefing`, `/api/push/*`, `/api/sync/*` | the brain, push and sync (below); SSE gains `job`, `watcher`, `briefing`, `spend` |
| `/api/senses`, `/api/hear`, `/api/speak` | hearing and George's voice for the phone (below; off until turned on) |

Units are in the field names (`…Pct`, `…C`, `…Bytes`, `…Bps`, `…Ms`). Values that cannot be read are `null`
with `available: false` and a plain-words `message`/`detail`, never a guess. Errors are
`{"error": code, "message": words}`.

**Who may connect:** direct requests from this computer (Host must be localhost/127.0.0.1/[::1] on the Core's
own port, which also stops DNS-rebinding pages), or requests through `tailscale serve` that carry
`Tailscale-User-Login` and this machine's `*.ts.net` name. Public Tailscale Funnel traffic
(`Tailscale-Funnel-Request`) is always refused, although it arrives from localhost. **Origins:**
`https://frankwise0202-maker.github.io`, any localhost origin, and the dashboard's own origin; every other origin
gets 403. Chrome's private-network preflights (a public page calling the 100.x Tailscale address) get
`Access-Control-Allow-Private-Network: true` for those origins only. A refused API request (403) still carries
CORS headers for those origins, so the Jarvis app can tell "refused" from a Core that isn't running behind
`tailscale serve` (Tailscale then answers 502 without them); Funnel traffic never gets them. **Limits:** 4 KB bodies and 300-character questions,
8 questions at once then 30 a minute per client, 16 live streams. (The brain's and the senses' own body
limits are in their sections.)

## Health rules

| item | warn | alert | notes |
|---|---|---|---|
| CPU temperature | 80 °C | 90 °C | 10 s to rise, falls below 75 °C for 30 s |
| GPU temperature | 80 °C | 88 °C | from nvidia-smi, or the nouveau driver without it |
| main drive / each mounted drive | 85 % | 95 % | |
| memory available | under 10 % | under 5 % | |
| swap used | 50 % | 80 % | 60 s |
| CPU busy | 90 % for 5 min | | |
| runaway process | one process at ≥ 90 % of a thread for 5 min | | |
| GPU driver | not loaded | | configurable |
| disk health (SMART) | reallocated / pending sectors | failing | "not checked" without permission |
| internet | | 2 failed checks | 1.1.1.1, then 8.8.8.8; up if the API or site answered |
| Claude API, Jarvis website | 2 failed checks | | "unknown" while the internet is down |
| Tailscale | logged out / off for 2 checks | | not installed is fine |

Every change of level is an event (`level` = the new level); starts, reboots and unexpected stops are `info`
or `warn` system events.

## The status assistant

Local and free: it normalises the question (contractions, chat shorthand, typo correction against its own
vocabulary), matches an intent, and fills a short template from the snapshot, the history and the event
log. It answers only about this machine and never claims to do anything. Intents: greeting, how-are-you,
status, problems, events, cpu, gpu, memory, disk, network, api, site, tailscale, temperature, multi, uptime,
restarts, trend, time, thanks, bye, identity, capabilities, unknown.

- Questions about the screen's state ("why caution", "why are you red", "what does alert mean") go to
  problems; "how do I fix it" and "what should I do" get one practical step per item (close ffmpeg, empty
  the Trash, install the driver), and "why is it slow" gets the CPU, memory, swap, drive and heat readings.
- Network speed is in bits per second (kb/s, Mb/s) with the dashboard's rounding, so both show the same
  figure. "What's my Jarvis address" gives the Tailscale address to paste into Jarvis > Settings > Home
  base (or says to run `jarvis-core url`); only an explicit "IP" question gets the IP addresses.
- "Hotter than usual?" compares the last 5 minutes' average with the 7-day one and says so.
- A question it can't place gets "I didn't catch that", with examples, never "that isn't about this computer".

## Persistence and restarts

`~/.local/share/jarvis-core/` holds `history-v1.json.gz`, `events-v1.json` and `state-v1.json` (folder 700,
files 600), written atomically (temporary file, fsync, rename), plus the brain's `brain/`, `push/` and `sync/`
folders. Lines that `jarvis-core autoupdate-tick` writes to `update-events.jsonl` become `core.update` /
`core.rollback` events once (then the file is removed). SIGTERM saves everything and exits; after a
crash the next start logs "restarted after an unexpected stop", and a new boot id logs the reboot. Health levels
that were not ok are kept in the state file, so a restart does not log a standing condition (a missing driver,
a full drive) again. An unreadable file is moved aside (`*.corrupt-<time>`) and the Core starts fresh.

## The brain

Everything the owner's Claude API key pays for runs here, one job at a time, while the phone is locked.

| | |
|---|---|
| `GET /api/brain` | `{version, key: {set, hint: "…Ab3D", setAt, verified}, sdk: {installed}, limits: {dailyUsd, monthlyUsd}, spend: {day, todayUsd, month, monthUsd, capReached: null\|"daily"\|"monthly"}, push: {vapidPublicKey, devices}, briefing: {enabled, time, units, location, lastAt, nextAt}, jobs: {running, queued}, watchers: {active}, owner: {name}, models}` |
| `PUT /api/brain/settings` | any of `{limits: {dailyUsd 0-50, monthlyUsd 0-500}, briefing: {enabled, time "HH:MM", units "F"\|"C", location {lat, lon, label}\|{city}\|null}, owner: {name}}` → the brain object. A city is geocoded with Open-Meteo; coordinates are rounded to 2 decimals. Unknown keys are refused (400). |
| `POST /api/brain/key {key}` | → `{ok, hint, verified}`; checked with the free `GET /v1/models` (offline: stored with `verified: false`); a rejected key → 400 `bad_key`. `DELETE /api/brain/key` → 204. 5 an hour. |
| `GET /api/spend?days=30` | `{days: [{day, usd, calls}] (newest first, days without calls included), month: {month, usd}, limits}` |
| `POST /api/jobs {kind: "research", prompt (≤ 2000), depth: "quick"\|"deep", title?}` | → 202 `{job}`; 409 `no_key`, 402 `spend_cap`, 503 `sdk_missing`, 429 `queue_full` (20 waiting). 20 an hour. |
| `GET /api/jobs?limit=50&kind=` | `{jobs}` newest first, without `result`; `kind` (research, watch-check, briefing) is optional |
| `GET /api/jobs/<id>` | `{job}` with `result: {markdown, sources: [{title, url}]}` |
| `DELETE /api/jobs/<id>` | a queued or running job → 200 `{job}` (cancelled; a running request is aborted); a finished one → 204 (removed) |
| `POST /api/watchers {what (≤ 300), every: "6h"\|"12h"\|"24h"}` | → 201 `{watcher}` (first check within a minute); 409 `no_key` / `too_many_watchers` (20) |
| `GET /api/watchers`, `DELETE /api/watchers/<id>` (204), `POST /api/watchers/<id>/check` | the last → 202 `{watcher, job}`; 409 `check_pending`, 402 `spend_cap` |
| `GET /api/briefing`, `POST /api/briefing/run` | the latest briefing (404 `none_yet`); make one now (12 an hour) |
| `POST /api/push/subscribe`, `DELETE /api/push/subscribe`, `POST /api/push/test` | push (core/server/push) |
| `PUT /api/sync/<device>`, `GET /api/sync`, `GET /api/sync/<device>` | sync (core/server/sync; 503 `sync_unavailable` without a data folder) |

Job: `{id: "j_…", kind: research|watch-check|briefing, title, prompt, depth, status: queued|running|done|failed|cancelled|blocked, createdAt, startedAt, finishedAt, costUsd, summary, error: null|{code, message}, result, watcherId?, stoppedEarly?: budget|daily|monthly|continuations}`.
Watcher: `{id: "w_…", what, every, status: watching|met|paused|blocked, createdAt, lastCheckAt, nextCheckAt, lastResult: {met, summary, sources}|null, costUsd, checks}`.
Briefing: `{date, generatedAt, kind: free|full, greeting, weather: {label, units, now: {temp, summary, code}, today: {high, low, rainChancePct, summary}}|null, headlines: [{title, source, url}], homebase: {level, summary, notes}, jobs: [{id, title, status, summary}], watchers: [{id, what, status, summary}], whatsNew: [{title, detail}], music: {suggestion, appleMusicUrl}|null, markdown, spoken}`.
SSE: `job` (a job without its result, on every change), `watcher`, `briefing` (`{date, generatedAt, kind, greeting}`), `spend` (the `spend` object).

**Claude.** The official SDK, imported on first use; every request is streamed and read with
`finalMessage()`, with adaptive thinking, server-side refusal fallbacks (`fallbacks: "default"`, dropped for
an account that refuses the beta) and only two tools, `web_search_20260209` and `web_fetch_20260209` (no
local tools: no shell, no files). `pause_turn` is continued append-only (the paused content is sent back
as the assistant turn, with the code-execution container), at most 4 times (deep: 8). Models, in
`brain/claude.mjs` `BRAIN_MODELS`: deep research `claude-opus-5-5` (effort high), quick research, watcher
checks and the briefing `claude-sonnet-5-5` (medium, low, low). The system prompts say web text is data,
never instructions; results are shown as Markdown/plain text only. `stop_reason` refusal → the job fails
(`refused`); max_tokens → the answer is kept with a note; a watcher check or briefing cut short is never
trusted. The key goes only to `https://api.anthropic.com` (always passed explicitly, so `ANTHROPIC_BASE_URL`
in the environment cannot redirect it).

**Spending.** Each response is priced from its `usage` with the app's table (`src/engine/models.js`, copied
in `brain/prices.mjs`): Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 per million tokens
(input/output; cache reads and 5-minute writes too), web search $0.01 each; after a refusal fallback each
attempt at its own model. Totals per local day and month in `brain/spend-v1.json`. Caps: $5 a day and $50
a month by default. A job that would start over a cap is `blocked` (`POST` → 402); a running one is
watched with a live estimate during the stream and stops when it would cross a cap or its own budget
(quick $0.75, deep $3, watcher check $0.15), keeping what it found (`stoppedEarly`). The full briefing
spends at most $0.30 a day. A cap of 0 means no background spending.

**Jobs.** One at a time (the briefing has its own lane so 07:00 never waits behind a long research job);
up to 20 waiting; kept in `brain/jobs-v1.json`. A job that was running when the Core stopped is queued
again at the next start (3 attempts at most). Finished: research `Research ready` notification
(`?homebase=job:<id>`), and `Research stopped` when it failed or was blocked.

**Watchers.** Checked every 6/12/24 h ± 5 % (at most ± 20 min) with one small call (web search ≤ 3,
fetch ≤ 1) that ends with a `report_check` tool call `{met, summary, sources}`. Met → notification
(`?homebase=watch:<id>`) and the watcher stops. No key: `paused` (resumes when a key comes back); a cap
reached: `blocked` (resumes when it clears). Max 20.

**Briefing.** At the configured local time (07:00, the Core's time zone, DST-safe; a Core that was down
at that time catches up within 3 hours, and a restart never repeats it) and on `POST /api/briefing/run`.
Free: greeting, Open-Meteo weather for the location from the app, up to 6 headlines from public feeds
(NPR, BBC News; Ars Technica, The Verge; alternating general and tech, last 36 h), the overnight report
from the Core's own history and events, research and watchers finished since the last briefing,
`core/whats-new.json` (entries of the last 3 days), and a music suggestion (an Apple Music search link).
Full (a key and budget left): the same facts plus one Claude call that writes it (`write_briefing` tool:
markdown, spoken, top headlines). Every fetch has an 8 s timeout and a size cap; the feed parser is a
linear scanner that never throws. The scheduled briefing sends a notification (`?homebase=briefing`).
In fixture mode weather and feeds come from `core/fixtures/brain/` (a made-up location), never the
internet.

**Files** (folders 700, files 600, written atomically): `~/.config/jarvis-core/secrets/anthropic.key` and
`anthropic.json` (`{setAt, verified}`, no key), `~/.local/share/jarvis-core/brain/` (`settings-v1.json`,
`spend-v1.json`, `jobs-v1.json`, `watchers-v1.json`, `briefing-v1.json`), `push/`, `sync/`. With
persistence off (fixture mode) the brain keeps everything in memory. The key is never logged, never
returned (only its hint), and anything shaped like a key is replaced by `sk-ant-…` in every log line,
error message and SSE frame.

**Tests** (`npm test`; a local fake Messages API that streams SSE, `test/server/brain/fake-claude.mjs`, never
the real one): key vault and leaks, cost math, research, pause_turn, caps and budgets, cancel, restart
survival, watchers met/not met, the free and full briefing with fixtures, the scheduler across DST, settings
and geocoding, the feed parser, the HTTP routes with their access rules, body and rate limits, SSE events,
and a start without `node_modules`.

## Hearing and voice (the senses, opt-in beta)

The phone can hand its listening and George's voice to the home base: Whisper hears better than the
iPhone's recognizer, and the Alienware makes Kokoro's George for the phone. Both are **off** until the owner
turns them on (`PUT /api/senses`), run on this computer's CPU only, and keep nothing: audio and text live in
memory for the one request and are never logged. The app falls back to the iPhone's own recognizer and voice
whenever the home base is off, slow or unreachable.

| | |
|---|---|
| `GET /api/senses` | `{hear: {enabled, model, state, progress, sizeMb, error, errorCode, downloaded, loaded, busy, queued, lastMs}, speak: {enabled, voice, dtype, …the same}, deps: {installed, missing?}}`; `state` is `off`, `downloading` (the first download and warm-up; `progress` 0-1), `ready` (on disk; `loaded` says whether it is in memory now) or `error` (`error` in plain words; `errorCode` `deps_missing`, `download_failed`, `load_failed`, `load_timeout`) |
| `PUT /api/senses` | any of `{hear: {enabled, model: "base.en"\|"small.en"\|"tiny.en" (or "fast"\|"accurate")}, speak: {enabled, voice}}` → the same object. Turning one on downloads (once) and loads it in the background; turning it off lets the model go (the files stay). PUT with `enabled: true` again retries after an error, and warms a model the idle timer let go. Unknown keys → 400. 60 an hour. |
| `POST /api/hear?prompt=…` | body: a WAV, 16 kHz, mono, 16-bit PCM, 0.1-30 s, at most 2 MB (`Content-Type: audio/wav`, `audio/x-wav`, `audio/wave` or `application/octet-stream`); `prompt`: context words for Whisper (cut to 200 characters) → `{text, ms, model, seconds}` (`ms`: the Core's time, queue included) |
| `POST /api/speak` | `{text (≤ 1000 characters), voice: "bm_george" (any Kokoro voice), speed: 0.5-2 (1)}` → `audio/wav`, 24 kHz, mono, 16-bit PCM; headers `X-Jarvis-Ms`, `X-Jarvis-Seconds`, `X-Jarvis-Sentences` (exposed to the app). Split by sentence (and long sentences at commas), spoken one at a time, joined with 120 ms pauses. |

Errors: 409 `hear_off` / `speak_off`; 503 `not_ready` (still downloading, `Retry-After: 10`), `deps_missing`,
`hear_unavailable` / `speak_unavailable` (the state's error), `busy` (3 already waiting, `Retry-After: 2`),
`engine_stopped` (turned off or crashed mid-request); 504 `timeout`; 400 `bad_audio`, `audio_too_long`,
`audio_too_short`, `bad_text`, `text_too_long`, `bad_voice`, `bad_speed`, `bad_request`; 413 over 2 MB
(hear) or 4 KB (speak, settings); 415 a wrong `Content-Type`. Access, origins, CORS and the general rate
limit are the API's own.

**Engines.** Each sense runs in **its own process** (`senses/worker.mjs`, forked on demand) at **nice 10**,
every thread of it (Linux keeps a nice value per thread; the process lowers its own threads at start and
onnxruntime's inherit it), with at most 4 compute threads. One request at a time per sense, 3 more may
wait (30 s at most); deadlines: hearing 45 s, speech 30 s + 150 ms per character, a first download and
load 30 minutes. After **30 minutes** without a request the engine process ends, which returns all of its
memory; the next request starts it again from the disk cache (a few seconds). A request past its deadline
ends the process at once (onnxruntime cannot be interrupted mid-run), so does turning a sense off.
*Why processes and not worker threads:* onnxruntime-node 1.21 aborts the whole process ("Entering the V8
API without proper locking") when a second worker thread runs a model (hearing and voice together, or a new
thread after an idle unload); in a worker thread that abort would take the Core down with it. Here a
crashed engine only fails its request, and the next request starts a fresh one.

**Models**, from huggingface.co at pinned commits (`senses/models.mjs`), cached in
`~/.cache/jarvis-core/models/<repo>/<commit>/` (`JARVIS_CORE_MODELS_DIR` moves it; settings in
`<data>/senses/settings-v1.json`). A file counts only at its exact size, so a download cut short is fetched
again, never loaded. Once downloaded they load with no network at all.

| sense | model | dtype | download |
|---|---|---|---|
| hearing, Fast (default) | `onnx-community/whisper-base.en` | q8 | 80 MB |
| hearing, Accurate | `onnx-community/whisper-small.en` | q8 | 252 MB |
| hearing, tests | `onnx-community/whisper-tiny.en` | q8 | 44 MB |
| voice | `onnx-community/Kokoro-82M-v1.0-ONNX` | fp32 (`JARVIS_CORE_SPEAK_DTYPE=q8` for the 92 MB one) | 326 MB |

*Why Kokoro fp32 and not q8:* on the 4-core test container (Xeon 2.1 GHz, AVX-512 VNNI) fp32 speaks a
4.6 s sentence in 3.4 s and q8 in 5.8 s (both 4 threads): Kokoro is mostly convolutions, which the 8-bit
build runs slowly on CPUs. The i7-6700 (AVX2, no VNNI) favours 8-bit even less, so fp32 should win there
too. Whisper is the other way round (matrix multiplications): base.en q8 1.5 s against fp32 2.0 s for 6.6 s
of speech.

**Timings** on the 4-core test container (Intel Xeon 2.1 GHz, 4 threads, everything at nice 10; the
i7-6700 has 4 real cores at 3.4-4.0 GHz but no AVX-512, so expect the same order of magnitude, not these
exact numbers):

| what | time |
|---|---|
| hear, base.en (Fast): a 6-7 s sentence / 25 s of speech | 1.1-1.6 s / 4.0 s |
| hear, small.en (Accurate): 6 s / 25 s | 3.3 s / 5.7 s |
| hear, tiny.en (tests): 6 s | 0.6 s |
| speak, fp32: "Certainly, Frank." (2 s of audio) / two sentences (6 s) / 738 characters, 6 sentences (54 s) | 1.1-1.2 s / 4.7 s / 33 s (0.6-0.8 × real time) |
| speak, q8: two sentences (6 s of audio) | 6.2-10.3 s (1.0-1.7 × real time) |
| first download + load + warm-up: tiny.en + Kokoro q8 (136 MB) / small.en (252 MB) | 3.5 s and 6.1 s / 7.0 s (a fast link) |
| load + warm-up from the disk cache: base.en / Kokoro fp32 | 3.3-3.8 s / 3.4 s |
| the first request after the idle unload: hear 7 s / speak "Certainly, Frank." | 3.0 s / 2.2 s (load without the warm-up run) |
| memory of an engine process: base.en / small.en / Kokoro fp32 | 660 MB / 1.46 GB / 1.08 GB (all of it back after 30 idle minutes) |
| the same round trip while other programs kept the 4 threads busy (load average 15) | hear base.en 6 s: 3.1 s; speak fp32 6 s: 13 s (nice 10 gives way, as intended) |

**Tests.** `npm test` (no downloads): WAV parsing and writing, the resampler, sentence splitting, prompts,
settings validation and the catalog (`test/server/senses/pure.test.mjs`); the engine host with a stub
engine in the real engine process: progress, the queue, deadlines, crashes (a native abort included), the
idle unload, cancelling, every engine thread at nice 10 (`host.test.mjs`); the routes through the runtime:
off by default, turning on, hearing, speaking, every refusal, CORS, body limits, restarts, a failed or
cut-short download, missing libraries and a Core without `node_modules` (`api.test.mjs`).
`npm run test:senses` (online, ~136 MB the first time): the real engines download whisper tiny.en and
Kokoro q8, George says a known sentence through `/api/speak`, the WAV goes back through `/api/hear`, and
the words must come back (`JARVIS_SENSES_TEST_MODELS=full` runs base.en and fp32 instead).

## What only the real machine can verify

NVIDIA GTX 970 readings through the 580 driver, coretemp on the i7-6700, `tailscale serve` headers end to end,
smartctl with a sudoers rule, the systemd user service and the GNOME kiosk. The fixtures reproduce their
formats (see `core/fixtures/`), and the live code path was smoke-tested on a Linux VM without those devices.
The brain's calls to the real Claude API (tested against a local fake of its streaming format), real Web
Push to an iPhone, and real Open-Meteo and news-feed answers (tested with recorded fixtures) are verified
only on the Alienware. The senses ran for real here (downloads, Whisper, Kokoro, nice 10), on a 4-core
container that is not an i7-6700: their speed on the Alienware itself, and a real iPhone's recordings, are
measured only there.
