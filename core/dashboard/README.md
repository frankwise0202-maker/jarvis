# Jarvis Core dashboard

The 24/7 system report on the Alienware's screen: a JARVIS-style live view of the home base (CPU,
graphics card, memory, storage, network, services, top processes, an event log) around the living
core, plus a small typed status assistant. Static files only (HTML, CSS, ES modules, Canvas 2D), no
frameworks and no build step. The Core serves this folder at `/` on `127.0.0.1:8788`; Tailscale
serve makes the same page reachable from the owner's iPhone and Mac, where it becomes the remote
view: a scrolling layout sized for the phone, the tablet or the laptop window, without the kiosk's
night dim, pixel shift, hidden cursor or self-reloads (see "The remote view" below).

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

## The home base brain (Core 1.1.0)

With a Core that has the brain (`GET api/brain` answers), the system report gains:

- **HOME BASE** (a strip under the core on the kiosk, a panel in the remote view): the Claude key
  ("KEY SET …Ab3D"; no key: "Add your key from Jarvis on your phone"; the SDK missing: "Run
  jarvis-core update"), the spend today and this month against the caps with a bar each (amber
  from 80 %, red at the cap, "SPEND · DAILY CAP REACHED"), and the watchers (how many are active,
  the latest one met).
- **MISSIONS**: the background research, the running and queued ones first, then the finished
  ones newest first, each with its status word (RUNNING, QUEUED, DONE, FAILED, BLOCKED, CANCELLED),
  its time and its one-line summary (or why it failed). The watchers' own checks and the briefing's
  call are not missions. On the kiosk layout the missions, the top processes and, for a remote
  viewer, the morning briefing share the bottom-left place with tabs: the processes come to the
  front by themselves while the CPU or the memory needs a look, the briefing on a remote viewer
  when there is one, the missions otherwise; a tab picked by hand stays 10 minutes.
- **MORNING BRIEFING** (remote viewers only: the iPhone, the iPad, the Mac): the latest briefing,
  with its date: the weather, the headlines (links), the night at the home base, the research and
  watchers that finished overnight, what's new and the music suggestion (an Apple Music link).

Everything is live: the stream's `job`, `watcher`, `spend` and `briefing` frames update it at once
(a `briefing` frame only carries the date, so the page reads `api/briefing`), and `api/brain`,
`api/jobs` and `api/watchers` are read again every minute as a backstop. The brain is only asked
for when `api/info` reports version 1.1.0 or later, and the briefing only once `briefing.lastAt`
says there is one, so an old Core or a first night never logs a 404 in the console. **A Core
without a brain (1.0.0) shows none of this**: no strip, no missions, no tabs, no morning.

### Morning mode (the kiosk only)

From the briefing time (`api/brain` → `briefing.time`, 07:00 by default) until 10:00, on the Core's
clock and in its time zone (wall-clock minutes, so the DST days just work), the Alienware's screen
shows a full-screen "Good morning, Frank." (the owner's name from `api/brain` → `owner.name`):

- the strip at the top keeps the health in sight: the state word, CPU, GPU, RAM, DISK and the clock;
- the greeting, the date and the weather (now, the high and low, the chance of rain), or, without a
  location, a calm line to open Jarvis on the iPhone once and share it; a full briefing (written by
  Claude) adds its first lines under the greeting;
- three cards: the headlines (up to 6, two lines each), the night at the home base and what finished
  while he slept (research and watchers), and what's new with the music suggestion;
- without a key, one line at the bottom: "Give the home base your key from Jarvis on your iPhone to
  unlock background research."; when something needs a look (a warning, an alert, the Core
  offline), the Core's own sentence in its color above it;
- no briefing yet at the briefing time: the greeting, a big clock, the Core's summary and "Your
  briefing is on its way."; the briefing shows the moment it arrives over the stream. Only today's
  briefing counts (its `date` on the Core's clock).

A key press or a mouse move returns to the full system report (that key does not also start a
question; Alt+J still opens Jarvis; Chrome's own mousemove without movement does not count); after
10 minutes without either, the morning comes back, until 10:00. Only input during the window
counts, so a mouse touched at 06:58 does not hold the morning back. The cards are built when a
briefing arrives, shown or not, so the screen appears at once and its size never changes when it
does. The night dim is lifted while the morning shows (a 06:30 briefing inside a 23:00–07:00 dim),
the living core behind it runs at half speed, the motion is calm (two slow rings, a breathing heart,
the cards rising in once) and stops with reduced motion. A window too small for the kiosk layout
gets the morning in one scrolling column.

## Kiosk behaviour

Everything in this section except the layout belongs to the Alienware's own screen only: the page
loaded from `localhost`, `127.0.0.1` or `[::1]` (`app/kiosk.js`: `screenFeatures`). A remote viewer
(the tailnet name, `https://<machine>.<tailnet>.ts.net/`) never dims at night, never shifts, never
hides the cursor and never reloads itself; keys typed on its page stay where they are typed.

- **Full screen, no scrolling** at 1920×1080. The root size follows the viewport, so 2560×1440 is
  the same layout scaled up; at 1366×768 and other small screens details drop (sparkline captions,
  gaps) and the text keeps a 12 px floor. Any window narrower than 1366 or shorter than 740 gets
  the remote view's layout instead (below), on the Alienware too.
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
- **Updates**: when `api/info` reports a new version after a restart, the page reloads itself (a
  remote viewer gets a notice instead: "Jarvis Core was updated. Reload this page…").
- **Daily refresh** at 04:00 (only if the page has been open an hour and the Core answers), as a
  safety net against browser-level growth; the page itself does not grow (see the long-run test).
- **Service worker** (`sw.js`): network first for the page's own files, so a kiosk that reloads
  while the Core restarts still shows the dashboard ("Connecting…") instead of a browser error. The
  API is never cached.

## The remote view (iPhone, iPad, Mac)

The same page, laid out by the window's size (`styles/dashboard.css`, after the kiosk's rules); the
kiosk layout itself is unchanged and is used wherever it fits (1366×740 and up, e.g. the Mac's
Chrome at 1440×900):

- **The kiosk layout on a remote viewer** (the Mac's Chrome, an iPad Pro on its side): the Mac's
  mouse keeps the kiosk's own sizes; a screen that can be touched (`any-pointer: coarse`) gets
  44 px chips, Ask and Open Jarvis and a 16 px question box. The transcript and the event log,
  which the kiosk shows only the newest of, scroll (the mouse wheel, a finger), and a new answer
  taller than its box arrives showing its first line, never only its end (`assistant.js`).
- **A phone held upright, a narrow window, an iPad in Split View (up to 560 px wide)**: one column
  that scrolls (with a brain, the morning briefing, HOME BASE and missions come first after the core). A compact top bar (the state word and the clock; the host, the uptime and a small
  Open Jarvis button under them), the living core at about `min(78vw, 320px)` with its four
  readouts (CPU, GPU, RAM, DISK) in a 2×2 grid under it instead of leader lines, the Core's
  summary sentence, then the panels in this order: Services, CPU, GPU, Memory, Storage, Network,
  Status assistant, Top processes, Event log.
- **A phone on its side, a tablet, a laptop window (561–1365 px wide, or under 740 px tall)**: the
  core with its readouts beside it on top (the four in one row from 1024 px), then the panels two
  by two in the same order, the event log across both columns. Two columns start at 561 px, where a
  half-width panel still holds the network's values ("UNREACHABLE", "999 Mb/s").
- **A phone on its side (under 431 px tall)**: the top bar keeps to one line (the small orb and the
  HOST label go, and at 640 px and narrower the host name, which the Services panel still shows in
  the machine's tailnet name), and the core sits at the top of its readouts, so the whole core is
  on the first screen.
- Each panel lays out its insides by its own width (CSS container queries): the big figure beside
  or above the others, the process lists stacked, a log row's text under its time, so the
  phone's column and a tablet's half-width column both fit. Nothing is cut: subtitles, captions,
  the event text and the transcript wrap instead of ending in "…", and the log and the
  transcript show everything they keep. A caption's parts are joined by " ·" and a no-break space
  (`format.js` `SEP`), so a wrapped caption takes its dot down with the next part.
- Only the state word sits on the smaller core's heart, sized with the core (12 px at the least),
  so "NOMINAL" and "CAUTION" stay inside it.
- 1rem is 16 px: labels 12 px, sentences 14 px and up, the question box 16 px (iOS zooms the
  whole page into a smaller field); where the box is too narrow for its hint, the hint ends in
  "…". Buttons and suggestion chips are 44 px tall; hover effects only where a pointer can hover,
  so a tapped chip does not stay lit.
- iOS: `viewport-fit=cover` with the safe-area insets around the page (the notch on its side, the
  home bar), `100dvh` heights, `-webkit-text-size-adjust: 100%`.
- The panels' index numbers (01–09) belong to the kiosk's columns and are hidden here.

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
the monotonic clock means offline. A page coming back from the background after more than 2 s (the
iPhone unlocked, a tab brought back, a page restored from the back-forward cache) opens a new
stream at once and reads everything again, so it shows fresh values instead of a red "Core
offline" banner while the browser notices that its old stream died.

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
| `app/kiosk.js` | which screen is the kiosk (`screenFeatures`); cursor, pixel shift, night dim, daily refresh, settings |
| `app/brain.js` | the brain's JSON to what the panels show (key, spend, watchers, missions, the briefing) and the morning schedule (pure) |
| `app/brain-view.js` | the HOME BASE strip/panel, missions, the tabs, the morning briefing panel and the morning screen |
| `styles/brain.css` | their layout on the kiosk and in the remote view, and the morning screen |
| `sw.js` | the network-first service worker for the page's own files |
| `test/` | unit tests, fixtures, a mock Core, the screenshot run and the long-run check |

## Tests

```bash
node --test core/dashboard/test/*.test.mjs                         # unit tests (format, model, kiosk, ring, data link, kiosk vs remote)
nice -n 10 node core/dashboard/test/screenshots.mjs                # every state at 1920×1080, 2560×1440, 1366×768 (real Core, fixture mode)
nice -n 10 node core/dashboard/test/phone-screenshots.mjs          # the remote view: iPhone, iPad, laptop windows, every state
nice -n 10 node core/dashboard/test/longrun.mjs --hours 48 --rate 200   # two simulated days after the warm-up, memory verdict
nice -n 10 node core/dashboard/test/morning-screenshots.mjs        # morning mode and the brain's panels on the kiosk (stand-in Core)
nice -n 10 node core/dashboard/test/phone-screenshots.mjs --brain ok   # the remote view with the brain's panels
nice -n 10 node core/dashboard/test/longrun.mjs --hours 24 --brain ok --start 2026-11-25T00:00:00Z   # with the brain, across 07:00 and 10:00
node core/dashboard/test/mock-server.mjs --scenario warn           # a stand-in Core on :8790 (same protocol, plus a "down" switch)
node core/dashboard/test/mock-server.mjs --brain ok --start 2026-11-25T07:05:00Z   # …with the brain (ok, nokey, overcap, sdk, noweather, long, waiting, full, busy)
```

The screenshot run starts a fresh real Core in fixture mode for every shot (`ok`, `warn`, `alert`,
`nogpu`, `internet` = the Core's `offline` fixture, `night` = `ok` at 23:31) and kills it for the
`offline` shot (the Core itself gone); `--mock` uses the stand-in. It fails on page scrolling, a
panel whose content is cut off, a value that does not fit its box, readouts that leave the core
stage or overlap the summary, console errors and CSP violations. After each screenshot it also puts
the longest event time (two weeks of hours, in the page's locale, en-US and en-GB) in a cloned log
row and a long drive name in each corner caption, and fails if either runs out of its column. Screenshots land in
`core/dashboard/test/artifacts/` (ignored by git).

The phone run (`phone-screenshots.mjs`) loads the page the way the iPhone does, through the
fixture's tailnet name (`alienware.tail4e5f6a.ts.net`, resolved to this computer, with the headers
Tailscale serve adds), at 320×568, 375×667 (iPhone SE), 390×844 and 844×390 (iPhone 13, with its
notch and home bar emulated), 667×375 and 568×320 (the iPhone SE and the first SE on their sides),
820×1180 (iPad), 1366×1024 (iPad Pro on its side), windows of 500×800 and 640×900, 1280×800 and
1440×900, the same two minus Chrome's tabs and address bar (712 and 812 tall), 1440×789 (with the
bookmarks bar) and 1366×740 (the smallest kiosk layout), in every state (`night` included: a
remote viewer must not dim). It saves the first screen and the whole page, and fails on: sideways
scrolling or anything past the screen's edges or under the notch, overlapping panels, readouts or
pieces of a row, text cut off or spilling out of its box (also with the longest values each figure
can show), a caption line that ends on its separator dot, text under 12 px or sentences under
14 px, touch targets under 44 px, a question box under 16 px or a hint cut without "…", a state
word wider than the core's heart, a core that does not fit the first screen, a top bar on two lines
on a phone on its side, the newest answer starting above the transcript's readable area, a
transcript or a log that is cut and cannot be scrolled to its first and last rows (by the mouse
wheel where there is a mouse), and any kiosk behaviour (dimming, shifting, a hidden cursor, typed
keys pulled into the question box). Windows big enough for the kiosk layout get the kiosk run's
checks instead, plus the transcript and log checks, and on a touch screen the 44 px targets and
the 16 px box.

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

With `--brain <preset>` the phone run uses the stand-in Core with the brain instead of the real
Core 1.0, so the morning briefing, HOME BASE and missions panels get the same checks at every size,
and the long run with `--brain ok` pushes four missions, a watcher and the spend every simulated
hour and a new briefing at 07:00, leaves 07:00–07:12 without questions so the morning screen comes
up (the next question closes it), and warms up until the page also keeps its 30 missions. Its
limits are made for long windows: over 6 hours the transcript's suggestion chips (±5 nodes) alone
read as a slope, so judge the brain with 24 hours or more.

The morning run (`morning-screenshots.mjs`) loads the kiosk against the stand-in with a brain
preset (`test/brain-fixtures.mjs`): morning mode with and without weather, without a key, with a
long headline list, the full briefing, the alert scenario, and no briefing yet at 07:00 (then one
arrives over the stream and must show at once); the system report with the brain in the ok, warn
and alert scenarios, without a key, over the cap, with the SDK missing, busy, and an old Core
without a brain (no brain UI at all). It fails on anything cut off or spilling out of the morning
screen or its cards, a strip on two lines, the night dim over the morning, a key press that does
not return to the system report (or lands in the question box), the brain UI on an old Core, and
the kiosk run's own layout checks.

What cannot be tested here: real NVIDIA readings, a GNOME session, Chrome's kiosk window and the
Open Jarvis window behaviour, a physical monitor (burn-in, brightness), Tailscale.
