# Jarvis Core server

One Node 22 process, `jarvis-core`, with **no npm dependencies**. It watches the Alienware around the clock,
keeps a week of history, decides whether things are ok, warn or alert, serves the 24/7 dashboard, and answers
simple questions about the machine's health. It listens on **127.0.0.1:8788 only**; other devices reach it
through `tailscale serve`.

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
8 questions at once then 30 a minute per client, 16 live streams.

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
files 600), written atomically (temporary file, fsync, rename). SIGTERM saves everything and exits; after a
crash the next start logs "restarted after an unexpected stop", and a new boot id logs the reboot. Health levels
that were not ok are kept in the state file, so a restart does not log a standing condition (a missing driver,
a full drive) again. An unreadable file is moved aside (`*.corrupt-<time>`) and the Core starts fresh.

## What only the real machine can verify

NVIDIA GTX 970 readings through the 580 driver, coretemp on the i7-6700, `tailscale serve` headers end to end,
smartctl with a sudoers rule, the systemd user service and the GNOME kiosk. The fixtures reproduce their
formats (see `core/fixtures/`), and the live code path was smoke-tested on a Linux VM without those devices.
