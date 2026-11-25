# Jarvis Core dashboard

The 24/7 system report on the Alienware's screen: a JARVIS-style live view of the home base (CPU,
graphics card, memory, storage, network, services, top processes, an event log) around the living
core, plus a small typed status assistant. Static files only (HTML, CSS, ES modules, Canvas 2D), no
frameworks and no build step. The Core serves this folder at `/` on `127.0.0.1:8788`; Tailscale
serve makes the same page reachable from the owner's iPhone and Mac.

## What is on the screen

- **Top bar**: JARVIS CORE · the host name · the state word (NOMINAL, CAUTION, ALERT, OFFLINE) with
  an icon · machine uptime · the clock and date · **Open Jarvis** (also **Alt+J**).
- **Centre**: the living core (copied and simplified from the app's `src/ui/hud/core.js`). Its color
  is the overall health (cyan ok, amber warn, red alert, grey offline) and the state word sits on it.
  Four quadrant gauges ring it, CPU, GPU, RAM and DISK, each with a leader line to a big corner
  readout; a gauge whose subsystem has a warning or an alert wears that color and a flag. The eight
  thick segments are the eight CPU threads; packets on the data ring follow network traffic; the
  scanner makes one pass each time the Core refreshes its network checks (every 30 s). Under it, one
  sentence: the Core's own summary.
- **Panels**: CPU (usage, package temperature, clock, a bar per thread, load averages, 10-minute
  sparkline), GPU (load, temperature, power, fan, VRAM, sparkline; "GPU driver not loaded" when
  `nvidia-smi` is missing), Memory (in use, used, available, swap), Storage (each filesystem with a
  meter, read/write activity, drive health or "not checked"), Network (down/up with sparklines,
  internet and Claude API latency, tailnet devices online), Services (Jarvis Core, the Jarvis site
  and its build, Claude API, Tailscale, then each tailnet device), Top processes (by CPU and by
  memory), the Event log (newest first, colored by level, 40 rows at most; a row's time is "9:47:03 PM"
  today, "Sat 9:47 PM" in the last six days and "Nov 14" before that) and the Status assistant. The
  DISK corner names a drive other than the system one by its last path segment ("BACKUP" for
  /media/frank-wise/BACKUP) and cuts a long name with an ellipsis.
- **Status assistant**: a question box (the Alienware has no microphone) with chips ("How are you?",
  "Anything wrong?", "GPU temp?", "Status report"). Questions go to the Core's local rule-based
  assistant (`POST api/ask`); it only reports on the machine. Typing anywhere on the page starts a
  question. The transcript keeps 6 exchanges and clears itself after 15 quiet minutes.

Values that are not known say so ("not available", "not checked", "driver not loaded", "no
sensor"); nothing is ever invented. Status is never color alone: every level has an icon shape
(circle ok, triangle warn, diamond alert, ring offline/unknown) and a word. The value a warning or
an alert is about (the CPU temperature, memory in use, a filesystem's percentage, the drive health)
also turns amber or red, so the cause reads from across the room. Sentences from the Core (events,
the summary, answers) keep each number with its unit on one line.

## Kiosk behaviour

- **Full screen, no scrolling** at 1920×1080. The root size follows the viewport, so 2560×1440 is
  the same layout scaled up; at 1366×768 and other small screens details drop (sparkline captions,
  gaps) and the text keeps a 12 px floor.
- **Cursor** hides after 3 s without movement.
- **Pixel shift**: the whole page moves to one of eight positions within 3 px every 3 minutes
  (derived from the clock, so it survives reloads).
- **Night dim** 23:00–07:00 local time by default: a black veil (55 %) fades in over 8 s, the core
  slows to half speed at 15 fps, transitions stop. Touching the mouse or keyboard lifts the dim for
  2 minutes.
- **Reduced motion** (the system setting) is respected: the core draws one still frame per change.
- **Offline**: if the Core stops answering for 5 s, the core turns grey, OFFLINE replaces the state
  word, a banner under the core says since when, and the last values stay up at 42 % opacity
  (stale data never looks live). The link reconnects on its own (1 → 10 s backoff) and catches up
  with one full read.
- **Updates**: when `api/info` reports a new version after a restart, the page reloads itself.
- **Daily refresh** at 04:00 (only if the page has been open an hour and the Core answers), as a
  safety net against browser-level growth; the page itself does not grow (see the long-run test).
- **Service worker** (`sw.js`): network first for the page's own files, so a kiosk that reloads
  while the Core restarts still shows the dashboard ("Connecting…") instead of a browser error. The
  API is never cached.

### Settings in the address

The autostart can pass these (or the Core can send them in `api/info` → `config`; the address wins):

| Parameter | Default | Meaning |
|---|---|---|
| `dim=23:00-07:00` | 23:00–07:00 | night dim window, local time; `dim=off` never dims |
| `dimlevel=0.55` | 0.55 | how much darker at night (0.2–0.85) |
| `shift=off` | on | no pixel shift |
| `refresh=04:00` | 04:00 | daily refresh time; `refresh=off` never |
| `cursor=show` | hide | never hide the cursor |
| `tz=Europe/London` | system | time zone for the clock (tests) |
| `locale=en-GB` | the Core's | 12 or 24 hours and date order for the clock and the log (tests) |
| `nosw` | | do not register the service worker |

Core config keys read from `api/info` → `config`: `nightDim` (`"23:00-07:00"` or `{start, end}`),
`dimLevel`, `pixelShift`, `dailyRefresh`, `jarvisUrl` (https only).

### Open Jarvis

The button (or Alt+J) calls `window.open('https://frankwise0202-maker.github.io/jarvis/', '_blank',
'noopener,noreferrer')` and shows a hint: "Close that window (Ctrl+W) to come back here." With Chrome
started as an app window (`--app=http://localhost:8788/ --start-fullscreen`) the link opens a normal
Chrome window; under `--kiosk` it opens a full-screen tab that Ctrl+W closes.

## Data

Every URL is relative (`api/status`, `api/stream`, …), so the page works at `/` on localhost and
behind `tailscale serve`. The contract is the Core's (`/tmp/jarvis-scratch/core/handoff-server.md`,
`core/server/`). On start the page reads `api/info`, `api/status`,
`api/history?range=15m&series=cpu,gpu,ram,netRx,netTx` (the sparklines' last 10 minutes) and
`api/events?limit=40`, then follows `api/stream`: `status` frames replace the whole state, `tick`
frames (every second, without `services` and without `health.items`) replace the sections they carry
and keep the rest, `event` frames go to the log (with their ids, so a reconnect replays what was
missed). Events are also polled every 15 s. Any frame proves the Core is alive; 5 s of silence on
the monotonic clock means offline.

The page follows **the Core's clock**: `status.t` minus the browser's clock gives an offset (about
zero on the machine itself), so a fixture started with `--start 23:30` shows 11:30 PM and dims, and
"checked 5 s ago" and the event times are always measured on the Core's clock. The clock's time
zone is the Core's (`api/info.timeZone`) unless `?tz=` says otherwise, and so is its locale
(`api/info.locale`, e.g. `en-US` for "4:47 PM"), so the clock, the log and the assistant's answers
write times the same way. From `api/info` the page also
takes the night window (`night {enabled, start, end}`) and the regular app's address (`urls.app`).

`app/model.js` is the one adapter from the Core's JSON to what the panels draw: it reads the Core's
field names (`cpu.usagePct`, `memory.usedPct`, `disks.mounts`, `gpu.status`, `services.*.status`,
…) with a few aliases, keeps unknown values as `null`, and maps health items to subsystems by their
id (`cpu.*`, `gpu.*`, `memory`/`swap`, `disk:*`/`disk.health`, `internet`, `api`, `site`,
`tailscale`); the gauges and panel chips wear those levels, the meters follow the brief's thresholds.
The assistant's `facts` are machine values for later voice use and are not shown; the answer is.
Small system partitions (under 2 GB, such as `/boot/efi`) are left out of the storage panel unless
they pass 85 %.

The page needs this Content-Security-Policy (no inline script or style is used):

```
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;
connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
```

## Files

| Path | What |
|---|---|
| `index.html` | the one page |
| `styles/tokens.css` | copied verbatim from the app's `src/styles/tokens.css` |
| `styles/hud.css` | the app's Presence building blocks (brackets, labels) and the Rajdhani faces |
| `styles/dashboard.css` | the layout and panels |
| `fonts/` | Rajdhani 600/700 (OFL), copied from `public/fonts` |
| `app/main.js` | wiring: data link, rendering (coalesced to one DOM update per frame), clock, kiosk |
| `app/client.js` | the data link: first read, SSE with a monotonic watchdog and backoff |
| `app/model.js` | the adapter and pure helpers (state word, events, history layouts) |
| `app/format.js` | units and words (pure) |
| `app/panels.js` | the panels, built once and updated in place |
| `app/core-orb.js` | the living core (Canvas 2D, no allocation per frame, 30 fps, 15 at night) |
| `app/spark.js` | the sparkline ring buffer (one slot a second) and renderer |
| `app/assistant.js` | the status assistant panel |
| `app/kiosk.js` | cursor, pixel shift, night dim, daily refresh, settings |
| `sw.js` | the network-first service worker for the page's own files |
| `test/` | unit tests, fixtures, a mock Core, the screenshot run and the long-run check |

## Tests

```bash
node --test core/dashboard/test/*.test.mjs                         # unit tests (format, model, kiosk, ring, data link)
nice -n 10 node core/dashboard/test/screenshots.mjs                # every state at 1920×1080, 2560×1440, 1366×768 (real Core, fixture mode)
nice -n 10 node core/dashboard/test/longrun.mjs --hours 48 --rate 200   # two simulated days after the warm-up, memory verdict
node core/dashboard/test/mock-server.mjs --scenario warn           # a stand-in Core on :8790 (same protocol, plus a "down" switch)
```

The screenshot run starts a fresh real Core in fixture mode for every shot (`ok`, `warn`, `alert`,
`nogpu`, `internet` = the Core's `offline` fixture, `night` = `ok` at 23:31) and kills it for the
`offline` shot (the Core itself gone); `--mock` uses the stand-in. It fails on page scrolling, a
panel whose content is cut off, a value that does not fit its box, readouts that leave the core
stage or overlap the summary, console errors and CSP violations. After each screenshot it also puts
the longest event time (two weeks of hours, in the page's locale, en-US and en-GB) in a cloned log
row and a long drive name in each corner caption, and fails if either runs out of its column. Screenshots land in
`core/dashboard/test/artifacts/` (ignored by git).

The long run plays the stand-in Core at 200× (a simulated day in about eight minutes): one
snapshot per simulated second, the scenarios cycling every two hours, an event every ten minutes,
an outage every six hours, a question every two real seconds asked five different ways, and the
page's clock following the simulated one (night dim, pixel shift, the transcript's quiet clear);
the daily refresh is off, so any growth would show. It warms up until the event log (40) and the
transcript (12 messages) are full, then measures every simulated hour on a quiet page (the
stand-in drops to real time for two seconds) after three forced collections, and judges the slope
per day and the drift between the two halves of the window for: nodes in the live document, every
DOM node alive in the renderer (CDP, detached ones too), the JS heap's data (a heap snapshot
without compiled code) and event listeners. The whole JS heap, its compiled code and the
renderer's RSS are reported beside them: V8 keeps optimizing functions as they get hot, so code
climbs for about a simulated day and then levels off, and the page cannot make new code (its CSP
has no `'unsafe-eval'`). See `test/growth.mjs` for the limits.

What cannot be tested here: real NVIDIA readings, a GNOME session, Chrome's kiosk window and the
Open Jarvis window behaviour, a physical monitor (burn-in, brightness), Tailscale.
