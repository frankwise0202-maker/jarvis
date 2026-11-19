# Jarvis

Jarvis is your own personal AI assistant. It answers questions, searches the web, remembers
what you tell it to, and for big questions it sends out a whole team of research agents at once
and writes up what they found, with sources. It talks, it listens, and it lives on your computer
and your phone like an app.

**Open Jarvis here: <https://frankwise0202-maker.github.io/jarvis/>**

There is no Jarvis company or server in the middle. Jarvis runs entirely in your web browser and
talks directly to Claude, Anthropic's AI, using your own Anthropic account. You pay Anthropic only
for what you use (cents for everyday questions, a dollar or two for a big research mission),
and your conversations are stored only on your device.

> **Important: keep this GitHub account just for Jarvis.** Don't publish any other GitHub Pages
> site from the `frankwise0202-maker` account. Every Pages site of one account lives at the same
> web address (`frankwise0202-maker.github.io`), and sites at the same address share the
> browser's storage, so another site there could read your API key and your conversations, or
> tamper with the copy of Jarvis saved on your device. Want to publish other sites? Use a
> different GitHub account for them. See [Who can read your key](#who-can-read-your-key) for
> other options.

---

## Contents

1. [What Jarvis can do](#what-jarvis-can-do)
2. [Step 1: Get your API key](#step-1-get-your-api-key-about-5-minutes)
3. [Step 2: Start Jarvis on your computer](#step-2-start-jarvis-on-your-computer)
4. [Step 3: Install Jarvis on your phone](#step-3-install-jarvis-on-your-phone)
5. [Using Jarvis](#using-jarvis)
6. [What it costs](#what-it-costs)
7. [Privacy](#privacy)
8. [Settings at a glance](#settings-at-a-glance)
9. [Updates](#updates)
10. [Troubleshooting](#troubleshooting)
11. [Running Jarvis on your own computer (optional)](#running-jarvis-on-your-own-computer-optional)
12. [Coming next: Raspberry Pi 5 Jarvis Core](#coming-next-raspberry-pi-5-jarvis-core)
13. [For developers](#for-developers)

---

## What Jarvis can do

- **Answer anything**, from quick facts to careful explanations, in clear, nicely formatted replies.
- **Search the web and read pages** for anything current: news, prices, opening hours, sports,
  the latest version of something. Answers come with links to the sources.
- **Deploy an agent swarm.** For big or many-sided questions ("compare the best family electric
  cars for under $50k", "plan a week in Lisbon"), Jarvis sends several research agents out in
  parallel, each with its own angle. You can watch every agent work live in **Mission Control**,
  then Jarvis combines their reports into one answer.
- **One-tap missions ("Protocols").** Morning Briefing, Deep Research, Compare & Decide, Trip
  Planner, Fact Check, Explain Simply, News Sweep and Gift Finder are ready on the home screen,
  and you can save your own.
- **Show Jarvis.** Attach photos (or take one) and PDFs, and ask about them.
- **Talk and listen.** Tap the microphone to dictate, have Jarvis read its answers aloud, or open
  **Voice Mode** for a hands-free spoken conversation.
- **Suggest what to ask next** after each answer, and **share or export** answers and full
  mission dossiers (every agent's task, report and sources).
- **Remember things** you ask it to ("remember that I'm vegetarian"). You can see and edit
  everything it remembers in Settings.
- **Keep your history.** Every conversation is saved on your device, searchable, and you can
  pick up where you left off.
- **Install like an app** on your computer, iPhone or Android phone, in the color theme you like,
  with subtle sounds, and a notification when a long mission finishes while you're away.

## Step 1: Get your API key (about 5 minutes)

Jarvis uses your own Anthropic account. You need an **API key**, which is like a password that
lets Jarvis use your account. You only do this once.

1. Go to **[console.anthropic.com](https://console.anthropic.com)** and sign up (or sign in).
2. **Add some credit.** Open **Billing** and buy a small amount of credit, for example $10.
   That lasts a long time for everyday use.
3. **Set a monthly spend limit.** In the console's **Limits** section, set a monthly limit you
   are comfortable with, for example $20. Anthropic will stop serving requests once it is
   reached, so this is your real safety net. (Jarvis also shows you its own spending estimate.)
4. **Create the key.** Open **API Keys**, choose **Create Key**, name it "Jarvis", and copy it.
   It starts with `sk-ant-`. The console shows it only once, so save it in your password
   manager.

Keep your key private, like a password: anyone who has it can spend your credit. If you ever
think it leaked, delete it in the console (API Keys) and create a new one.

## Step 2: Start Jarvis on your computer

1. Open **<https://frankwise0202-maker.github.io/jarvis/>** in Chrome, Edge or Safari.
2. Follow the short welcome:
   - tell Jarvis what to call you,
   - paste your API key and press **Connect** (Jarvis sends one tiny test message to check it),
   - and you're ready.
3. Ask something! Try one of the suggestions on the start screen.

**Install it as an app (optional, recommended):**

- **Chrome or Edge:** click the install icon at the right end of the address bar (a small
  monitor with an arrow), or open the menu **⋮** and choose **Install Jarvis**
  (in some versions: **Cast, save and share → Install page as app**).
- **Safari on a Mac** (macOS Sonoma or later): **File → Add to Dock**.

Jarvis then opens in its own window and appears with your other apps.

## Step 3: Install Jarvis on your phone

Your API key is stored only on the device where you typed it, so on your phone you will paste
it once more (copy it from your password manager).

### iPhone (iOS 16.4 or later)

1. Open **<https://frankwise0202-maker.github.io/jarvis/>** in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open Jarvis from its new icon on your Home Screen. It opens full screen, like any app.
5. Go through the short welcome and paste your key.
6. The first time you tap the microphone, allow microphone access.

### Android

1. Open **<https://frankwise0202-maker.github.io/jarvis/>** in **Chrome**.
2. Tap **Install** when Chrome offers it, or open the menu **⋮** and tap **Install app**
   (or **Add to Home screen**).
3. Open Jarvis from your home screen or app drawer, and go through the short welcome.

## Using Jarvis

- **Ask** by typing, or tap the **microphone** and speak. On a computer, **Enter** sends and
  **Shift+Enter** starts a new line.
- **Run a Protocol**: tap a tile under the greeting (scroll down on a phone). Tiles that need a
  topic open a small box for it; **New protocol** saves your own one-tap mission.
- **Show Jarvis a photo or PDF** with the paperclip (or the camera on a phone). Photos are
  resized and their location data removed before they are sent.
- **Voice Mode**: tap the sound-wave button at the top (or the glowing core on the home screen)
  and just talk. Jarvis answers out loud and listens again; tap the core to interrupt.
- **Choose a mode** under the message box:
  - **Auto**: Jarvis decides whether to answer directly, search the web, or send agents.
  - **Quick**: a fast answer from Jarvis alone (it may still do a quick web search).
  - **Swarm**: always send the full agent team. Next to the modes you can pick the team size
    for that message (3 to 20 agents).
- **Watch the swarm.** When Jarvis deploys agents you will see a mission card with every agent
  (Atlas, Nova, Echo, …) and what each one is doing right now. Tap it to open
  **Mission Control**: each agent's task, searches, sources, cost and full report. When they
  are done, Jarvis writes one combined answer with sources.
- **Stop** a reply at any time with the stop button.
- **Resume** an interrupted mission: phones pause apps in the background, so if you switch away
  in the middle of a big mission, it may say *Interrupted*. Come back and tap **Resume**; agents
  that already finished are kept.
- **Hear answers aloud**: tap **Speak** under an answer, or turn on spoken replies in
  Settings → Voice (a short summary, or the full answer).
- **Ask next**: after an answer, up to three suggested follow-up questions appear; tap one to ask it.
- **Share** an answer, or a whole mission as a dossier, from the **Share** button under it
  (on a phone this opens the usual share sheet; elsewhere it copies or downloads Markdown).
- **Systems**: Settings → API key & spending → **Systems dashboard** (or the Systems row on a
  computer) shows how many agents, searches and sources Jarvis has used, and the spend.
- **Memory**: say things like "remember that I prefer metric units" or "forget my old address".
  Jarvis tells you when it saves something; review it in Settings → Memory.
- **History**: open the history list to search and reopen past conversations, or start a new
  chat. Shortcuts on a computer: **Ctrl/⌘ + K** new chat, **Esc** closes panels.
- **Demo**: to show Jarvis to someone without using your account, open
  <https://frankwise0202-maker.github.io/jarvis/?demo=1>, a scripted demonstration that costs nothing.

## What it costs

Jarvis itself is free. You pay Anthropic for what Jarvis uses, at Anthropic's normal prices,
from the credit in your account. Rough examples:

| What you ask | Typical cost |
|---|---|
| A quick question | about 2–6¢ |
| An answer that needs a web search | about 6–16¢ (each web search is $0.01 of that) |
| An 8-agent swarm at the Balanced depth | about $1–2.50, typically around $1.70 |
| A Deep swarm with 20 agents | about $7–15 |

For example, $200 of credit a month covers roughly 100 Balanced swarm missions (more if some
are Fast), with room left over for everyday questions. Follow-up suggestions use the small Claude Haiku model
and cost a tiny fraction of a cent. A photo or PDF you attach is re-read with every later message
in that conversation (at a reduced, cached price), so start a new chat when you change topic.

- Under each answer Jarvis shows an **estimate** of what it cost, and Settings shows your
  estimated spending this month. You can set a **warning threshold** there.
- Estimates are approximate. Your exact bill is in the Anthropic console under Billing, and the
  **monthly spend limit** you set in Step 1 is the hard stop.
- To spend less: use **Quick** mode, choose the **Fast** depth, pick a smaller team size in
  Swarm mode, or lower **Agents per wave** in Settings → AI.

## Privacy

- **No middleman.** The app is a set of files hosted on GitHub Pages. Once loaded, it runs in
  your browser and sends your messages straight to Anthropic's API (`api.anthropic.com`).
  Web searches are carried out by Anthropic on Jarvis's behalf.
- **Your API key stays on your device.** It is stored only in this browser on this device (see
  below for what else can read it there). It is never put in a web address, never included in
  backups, and never shown in full again after you enter it. If you paste something that looks
  like a key into a message, Jarvis asks before sending it; if you send it anyway, that
  conversation is left out of backups, and the key is replaced by "[API key removed]" in
  anything you share, copy or download.
- **Your conversations stay on your device.** History, memory and settings are stored in the
  browser on each device. They are not synced between devices. Clearing the site's data or
  uninstalling the app deletes them, so use **Settings → Data → Export backup** to keep a copy.
- **What others see.** GitHub sees ordinary visits to the app's files, like any website, but not
  your conversations. Anthropic processes what you send under its own privacy policy and terms.
- **Voice.** Dictation (the microphone) uses your browser's speech service: Google's in Chrome,
  Microsoft's in Edge, Apple's in Safari and on iPhone, which may process your voice on its
  servers. Spoken replies use a voice from your device or browser: voices marked "(online)" in
  Settings → Voice send the text they read aloud to their provider (Google or Microsoft); the
  others speak on your device without sending anything.
- **Location** is never used unless you type one into Settings (it helps with local questions).
- **Photos** you attach are shrunk and stripped of their location data before they are sent.
  Like the rest of the conversation, they are kept on this device only (and are included in
  backups).
- Anyone who can unlock your device can use your Jarvis, so keep a passcode on your devices.

### Who can read your key

Browsers keep each website's storage separate, by web address. Jarvis keeps your key and your
history in the storage for `https://frankwise0202-maker.github.io`. Anything that runs at that
address can read them:

- **Jarvis itself**, which only ever sends the key to Anthropic.
- **Any other GitHub Pages site published from the `frankwise0202-maker` account.** GitHub serves
  all of an account's sites from that one address, so they share Jarvis's storage. Such a site
  could read your key and history, and could even change the offline copy of Jarvis on your
  device. **So keep this GitHub account just for Jarvis.** If you want to publish other sites,
  you can: publish them from a different GitHub account (the simplest); give Jarvis its own web
  address with a custom subdomain (for example `jarvis.your-domain.com`, set in the repository's
  **Settings → Pages → Custom domain**); or host Jarvis somewhere that gives every project its own
  address (for example Cloudflare Pages or Netlify). A new address starts Jarvis fresh: paste your
  key again and use **Export backup** / **Import backup** to bring your conversations along.
- **Browser extensions** that you have allowed to "read and change data on all websites". Only
  install extensions you trust.

Other websites (at other addresses) cannot read it.

## Settings at a glance

- **Profile & style:** what Jarvis calls you, **Jarvis's style** (Butler, Friendly, Professional
  or Playful) and how long its answers are (Concise, Balanced or Detailed).
- **AI:** the models used (Claude Opus 5.5 leads, Claude Sonnet 5.5 agents by default; Opus or
  Sonnet can lead, and agents can also use the cheaper Claude Haiku), research depth (Fast,
  Balanced, Deep), default mode, agents per wave, how many work at once, how many follow-up
  waves, whether to show Jarvis's thinking, and follow-up suggestions.
- **Voice:** spoken replies, the voice and its speed, the language you speak in, and whether
  Voice Mode keeps listening after each reply.
- **Appearance & sound:** six color themes, sounds and their volume, vibration (Android), and a
  notification when a mission finishes while Jarvis is in the background.
- **Location:** optional, for local answers (weather, opening hours, prices).
- **Memory:** everything Jarvis remembers about you; edit or delete any of it.
- **API key & spending:** test, replace or remove your key; this month's estimate; warning
  level; the **Systems dashboard**.
- **Data:** export a backup (conversations, memory, settings, your own protocols and statistics),
  import one, or reset Jarvis on this device.
- **Install:** how to install Jarvis on this device.

## Updates

Jarvis updates itself. When a new version is published you will see a small message, "A new
version of Jarvis is ready", with an **Update** button; tap it to reload. On an iPhone, if you
don't see it, close Jarvis completely (swipe it away) and open it again.

## Troubleshooting

| What you see | What to do |
|---|---|
| **"Your API key was rejected"** | Open Settings → API key and paste your key again (it starts with `sk-ant-`). If it was deleted in the console, create a new one. |
| **"Out of credits"** | Add credit in the Anthropic console under Billing. |
| **"Rate limit reached, slowing down"** or a swarm pauses ("Rate limited – retrying in …s") | Nothing to do: Jarvis waits and retries, and runs fewer agents at once. New Anthropic accounts start with low rate limits, so your first swarms may pause like this; the limits rise automatically as you use your account (see Console → Limits). If it happens a lot, lower **Running in parallel** (and **Agents per wave**) in Settings → AI. |
| **Answers never search the web** | In the Anthropic Console, check your organization's settings and make sure web search and web fetch are allowed. |
| **"Overloaded" or a server error** | Anthropic is busy. Jarvis retries automatically; if it still fails, try again in a minute. |
| **A mission says "Interrupted"** | Your phone paused the app or the connection dropped. Open Jarvis and tap **Resume**. |
| **"You're offline"** | Jarvis opens without internet, but needs a connection to answer. |
| **Jarvis doesn't speak on iPhone** | Turn off silent mode and turn the volume up. Speech starts after you have tapped once in the app. |
| **No notification when a mission finishes** | Settings → Appearance & sound → **Allow notifications**. On iPhone, notifications only work in the installed app (Share → Add to Home Screen), and iOS may pause Jarvis in the background before the mission ends. |
| **The microphone does nothing** | Allow microphone access for the site (iPhone: the **aA** menu in Safari → Website Settings, or Settings → Apps → Safari → Microphone). Voice input needs the secure `https://` link and isn't available in every browser (for example Firefox). |
| **No "Install" option** | On iPhone use **Safari** (Share → Add to Home Screen); on Android use **Chrome**; on a computer use Chrome or Edge, or Safari's File → Add to Dock. |
| **A spending warning** | Your estimated spending passed the threshold you set. Change it in Settings → API key & spending. |
| **Something looks stuck** | Reload the page. Your conversations are saved. |
| **Start completely fresh** | Settings → Data → **Reset Jarvis**. This deletes everything on this device, including your key. |

## Running Jarvis on your own computer (optional)

You don't need this to use Jarvis, but you can run your own copy:

1. Install **Node.js** version 20 or newer (22 recommended) from [nodejs.org](https://nodejs.org).
2. Download this project (on GitHub: **Code → Download ZIP**, then unzip it), or `git clone` it.
3. Open a terminal in the project folder and run:

   ```sh
   npm install && npm start
   ```

4. Open **<http://localhost:8642>**. The terminal also prints a network address that other
   devices on your Wi-Fi can open. Installing the app, the microphone and offline mode need a
   secure (`https://`) address, so on phones use the GitHub Pages link instead.

Press **Ctrl+C** in the terminal to stop it.

## Coming next: Raspberry Pi 5 Jarvis Core

The next step is **Jarvis Core**: a small always-on box built on a Raspberry Pi 5 with a camera,
a microphone and a speaker, so you can talk to Jarvis anywhere in the room without picking up a
phone. Jarvis's brain (its "engine": how it talks to Claude, runs agent missions and handles
interruptions) is already built separately from the screen you see today, so the same engine can
run on the Pi. Your phone and computer apps stay exactly as they are.

## For developers

Jarvis is plain JavaScript ES modules (no framework) bundled with esbuild. The browser calls the
Claude API directly through the official `@anthropic-ai/sdk`. **[SPEC.md](SPEC.md)** is the
binding contract for every module.

```text
public/           static files copied into dist/ (index.html, manifest, service worker, icons)
src/engine/       conversation engine: lead, agent missions, streaming, prompts (no DOM)
src/platform/     settings, API key, IndexedDB history, memory, spend, voice, PWA helpers
src/lib/          safe streaming Markdown → DOM renderer
src/ui/           app shell, chat, composer, sheets; src/ui/hud/ the HUD (core, Mission Control)
src/styles/       design tokens and styles
scripts/          build.mjs, serve.mjs, deploy-pages.mjs, make-icons.mjs
test/unit/        node --test unit tests
test/mock/        strict mock of the Claude Messages API (HTTP handler + in-process fetch)
test/server.mjs   dist/ + mock API on one origin
test/e2e/         Playwright end-to-end scenarios
```

| Command | What it does |
|---|---|
| `npm run build` | Bundles `src/main.js` into `dist/assets/app.js` + `app.css` (minified, source maps, target es2020/safari15), copies `public/`, stamps the build id and the service worker's precache list, prints sizes. |
| `npm start` | Builds if `dist/` is missing (`-- --rebuild` to force), then serves `dist/` on `0.0.0.0:8642` (`PORT=…` to change). |
| `npm test` | Unit tests (`node --test`). |
| `npm run e2e` | Builds, then runs the Playwright Chromium scenarios against the real app and the mock API. Options: `-- --only swarm,xss`, `--headed`, `--list`, `--no-build`, `--mock-speed 0.5`. Screenshots and failure reports go to `test/artifacts/`. |
| `npm run deploy` | Builds and commits `dist/` (plus `.nojekyll`) as "Deploy &lt;build id&gt;" on the `gh-pages` branch through a temporary git worktree; `main` is never touched. Add `-- --push` to publish to `origin`. |
| `npm run icons` | Regenerates the app icons. |

**GitHub Pages, first time:** on GitHub open **Settings → Pages**, choose **Deploy from a
branch**, branch `gh-pages`, folder `/ (root)`. After `npm run deploy -- --push` the app is live
at <https://frankwise0202-maker.github.io/jarvis/>.

**One Pages site per account (security).** All GitHub Pages project sites of an account share
one origin (`https://<owner>.github.io`), and with it `localStorage`, IndexedDB, Cache Storage
and service-worker scope at the root. Any other Pages site of the same account could read the
API key and history, or plant files in Jarvis's offline cache. Publish Jarvis from an account
that hosts nothing else, or give it its own origin (a custom subdomain, or a host with
per-project origins). `npm run deploy` prints this reminder on every run.

**Testing against the mock API by hand:** `node test/server.mjs` serves the app and the mock on
one port and prints the snippet to paste into the browser console (it sets
`jarvis.dev.apiBase`, a mock key `sk-ant-test-…` and an onboarded profile). The app honors
`jarvis.dev.apiBase` only for its own origin or `localhost`/`127.0.0.1`.

**The mock Claude API** (`test/mock/anthropic-mock.mjs`) validates requests like the real API
(credentials, `anthropic-version`, browser-access header, models, `max_tokens`, no sampling
parameters, adaptive thinking only, efforts, no forced `tool_choice`, exact server tools,
structured-output schemas, beta-gated `fallbacks`/`context_management`, tool_use ↔ tool_result
pairing, `pause_turn` resumes, no prefill) and emulates the history-editing check: every thinking
block's signature is bound to the conversation before it, so an edited history gets a 400.
Requests and violations are logged at `/__mock/requests` and `/__mock/violations`
(`POST /__mock/reset` clears them). Directives in the latest user message script its behavior:

| Directive | Behavior |
|---|---|
| *(none)* | short thinking, then a helpful answer ("Paris" for the capital of France) |
| `[[search]]` | a web search, 3–5 results, and an answer with citations |
| `[[swarm:N]]` | one sentence, then `deploy_agents` with N agents; the next request gets a synthesis naming every agent |
| `[[waves:2]]` | a second wave of 2 agents after the first results |
| `[[pause]]` / `[[workerpause]]` | the lead's / each agent's first response ends with `pause_turn` |
| `[[ratelimit:K]]` | the first K agent requests get 429 (`retry-after: 0`) |
| `[[ratelimit:K:S]]` | the same, with a realistic `retry-after: S` seconds (Jarvis shows a live countdown) |
| `[[otpm:N]]` | an output-tokens-per-minute limit of N: requests whose `max_tokens` exceeds it get the real 429 shape, and Jarvis caps `max_tokens` and retries |
| `[[overloaded]]` | the first lead request gets 529 |
| `[[refuse]]` | `stop_reason: refusal` with `stop_details` |
| `[[slow]]` | slow streaming (≈120 ms between lead events, ≈6 s per agent) |
| `[[xss]]` | an answer (and agent reports) full of XSS payloads |
| `[[badtool]]` | an invalid `deploy_agents` input first, a valid one after the error result |
| `[[memory]]` | `update_memory` "Prefers metric units", then a confirmation |
| `[[dropworkers]]` | each agent's first stream is cut mid-way; later attempts succeed |
| `[[workerfail]]` / `[[workerrefuse]]` | one agent always gets a 500 / a refusal |
| `[[long]]` | a long Markdown answer (headings, table, code, lists, quote) |

Security rules worth knowing before you change anything: the Content-Security-Policy in
`index.html` is fixed by SPEC §2; model, web and user text is rendered only through
`src/lib/markdown.js` (never `innerHTML`); links from model output must be `http:`, `https:` or
`mailto:` and open with `rel="noopener noreferrer"`; and the API key is never logged, put in a
URL, or exported. Shared and downloaded Markdown goes through `safeMarkdown` and
`redactSecrets` in `src/ui/share.js` (no raw HTML, no non-http(s) links, no API keys), and
backups leave out conversations that contain a key.
