# Jarvis

Jarvis is your own personal AI assistant. It answers questions, searches the web, remembers
what you tell it to, and for big questions it sends out a whole team of research agents at once
and writes up what they found, with sources. It talks, it listens, it can pull up a 3D hologram of
how something is built, and it lives on your computer and your phone like an app.

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
- **One-tap missions ("Protocols").** Morning Briefing, Deep Research, Blueprint, Compare &
  Decide, Trip Planner, Fact Check, Explain Simply, News Sweep and Gift Finder are ready on the
  home screen, and you can save your own.
- **Show Jarvis.** Attach photos (or take one) and PDFs, and ask about them.
- **See how things are built.** Ask "show me a 2024 Camry" or "what's inside an AA battery?" and
  Jarvis builds a glowing **3D hologram** with every part labeled, which you can turn, take apart
  and tap. A **2D blueprint** of a part (or the whole thing) is drawn only when you ask for one,
  everything is kept in your **Blueprints** library to reopen for free, and **Photos** shows real
  pictures of any part. It all works by voice too.
- **Talk and listen.** Tap the microphone to dictate, have Jarvis read any answer aloud, or open
  **Voice Mode** for a hands-free spoken conversation: Jarvis answers in a few natural sentences
  and starts talking while it is still writing.
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
2. Tap the **Share** button (the square with an arrow pointing up). On newer iOS versions it may be
   tucked under the **•••** button at the bottom of Safari.
3. Scroll down and tap **Add to Home Screen** (keep **Open as Web App** on if you see it), then **Add**.
4. Open Jarvis from its new icon on your Home Screen. It opens full screen, like any app.
5. Go through the short welcome **there** and paste your key. (Do the setup in the Home Screen app,
   not in Safari: the installed app keeps its own storage, so a key typed in Safari doesn't carry over.)
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
  and just talk. Jarvis writes its reply for listening (a few natural sentences, no lists or
  links) and starts speaking within a second or two, while the rest is still being written. Before
  it searches the web or sends agents it says so ("Let me check the latest on that."), then keeps
  working. Longer details (steps, comparisons, sources) go on screen under the spoken part; tap
  **Read full answer** to hear those too. When it has finished speaking it listens again
  (**Continuous**, top right). Tap the core while Jarvis is talking to interrupt it and speak, or
  while it is working to stop it. Once it has said all it will say aloud, a tap only stops the
  voice: the details still appear on screen, and what you ask meanwhile is answered as soon as
  they are done (the button below reads **Stop writing** if you want to stop the details too).
  **Exit** leaves Voice Mode; a reply or mission that is still running carries on in the chat
  (and isn't read out again there if Jarvis had already started saying it). Ask to see something
  ("show me this car") and the hologram opens right over Voice Mode while it builds; see
  [Holograms and blueprints](#holograms-and-blueprints).
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
- **Hear answers aloud**: tap **Speak** under an answer to hear all of it (tap again to stop).
  The screen stays on while it reads, so a long answer isn't cut off when the phone would lock.
  To have every answer read out as it arrives, choose Settings → Voice → **Speak replies**:
  **Short summary** (its opening paragraph) or **Whole reply**.
- **Ask next**: after an answer, up to three suggested follow-up questions appear; tap one to ask it.
- **Share** an answer, or a whole mission as a dossier, from the **Share** button under it
  (on a phone this opens the usual share sheet; elsewhere it copies or downloads Markdown).
- **Systems**: Settings → API key & spending → **Systems dashboard** (or the Systems row on a
  computer) shows how many agents, searches and sources Jarvis has used, and the spend.
- **Memory**: say things like "remember that I prefer metric units" or "forget my old address".
  Jarvis tells you when it saves something, with an **Undo** button right there in case it got it
  wrong; review everything it remembers in Settings → Memory.
- **History**: open the history list to search and reopen past conversations, or start a new
  chat. Shortcuts on a computer: **Ctrl/⌘ + K** new chat, **Esc** closes panels.
- **Demo**: to show Jarvis to someone without using your account, open
  <https://frankwise0202-maker.github.io/jarvis/?demo=1>, a scripted demonstration that costs nothing.

### Holograms and blueprints

- **Ask to see something:** "show me a 2024 Toyota Camry Hybrid", "how does a car alternator
  work?", "what's inside an AA battery?". Jarvis builds a glowing 3D hologram of that exact thing,
  part by part while you watch, with every part labeled. A card appears in the chat: tap **Open**
  to see it full screen (in Voice Mode it opens by itself).
- **Look around:** drag to turn it, pinch or scroll to zoom, and drag with two fingers to move it.
  **Exploded** (or the slider) takes it apart so you can see inside; **Assembled** puts it back
  together. **Labels**, **Rotate**, **View** (front, side, top…), **Parts** (a list of every part)
  and **Reset** are along the bottom.
- **Tap a part** to highlight it and read what it does and what it's made of. Its card also has
  **Photos**, **Isolate** (show only that part) and **Focus** (zoom to it).
- **Say or type commands** in the box at the bottom, or tap its microphone. These happen on your
  device, instantly and for free: "expand it", "put it back together", "show the alternator",
  "isolate the rotor", "zoom in on the pulley", "labels off", "rotate", "stop", "front view",
  "photos of the fan", "close". Anything else, like "why is the cathode a ring?", goes to Jarvis
  as a normal question, and the answer appears over the hologram.
- **2D blueprints are drawn only when you ask:** tap **Build 2D blueprint** on a part's card, tap
  **2D** for the whole object, or say "blueprint the alternator". You get an engineering sheet
  with numbered parts, a parts list, sizes and notes; zoom in, tap a number to find that part, or
  download it as an SVG or PNG picture. Each new blueprint costs about 15¢ (the button shows the
  estimate first). A part that already has one shows **Open blueprint**, which is free; **Rebuild**
  draws a fresh one.
- **Your Blueprints library** (the **Blueprints** button at the top, or History → **Blueprints**
  on a small phone) keeps every hologram and blueprint Jarvis has made for you, each with a small
  picture. Opening one again is free, needs no internet, and asks Jarvis nothing. You can also
  download or delete them there. When you ask for something you've already seen, Jarvis reopens
  the saved one instead of building it again.
- **Photos** shows real photographs of the object or a part from Wikimedia Commons, with the
  photographer's name and license. Photos are free (see [Privacy](#privacy)).
- **The Blueprint protocol** on the home screen asks "What should I blueprint?", sends a research
  team to find out how that exact thing is built and made, then builds the hologram and explains
  it, with sources. It draws no 2D sheets until you ask.
- **In Voice Mode**, say "show me this car" and the hologram opens over Voice Mode as it builds,
  while Jarvis tells you what you're looking at ("Here's the Camry. Say 'expand it' or tap any
  part."). Then just talk: "expand it" or "show the alternator" happen at once, with a short
  answer ("Expanding.", "Here's the alternator."); "blueprint the alternator" draws that blueprint
  and opens it when it's ready; any other question is answered out loud and shown over the
  hologram. With **Continuous** on, Jarvis keeps listening between commands; otherwise tap the
  microphone in the hologram's command box (while Jarvis is working or talking, that button stops
  him, like the glowing core does). Close the hologram to get back to Voice Mode.

### A more natural voice

Jarvis speaks with the voices your device and browser already have, so it costs nothing extra.
The basic voices sound robotic; better ones are a free download. Settings → Voice lists the
voices best first and marks the good ones **Premium**, **Enhanced** or **Natural**; leave it on
**Automatic** to get the best one you have (voices on your device before online ones, British
ones preferred).

- **iPhone or iPad:** Settings → Accessibility → Spoken Content → Voices → English, pick a voice
  marked Enhanced or Premium (Daniel or Arthur for a British voice) and download it. Then close
  Jarvis completely (swipe it away) and open it again. If it doesn't appear in Jarvis's list, your
  version of iOS doesn't offer it to web apps.
- **Mac:** System Settings → Accessibility → Spoken Content → System voice → Manage Voices… →
  English (United Kingdom) → Daniel or Arthur (Enhanced or Premium), then reload Jarvis.
- **Windows:** in Microsoft Edge, voices marked "Natural" sound the most human. They are online,
  so the text they read goes to Microsoft. Or add on-device voices: Settings → Time & language →
  Speech → Add voices → English (United Kingdom).
- **Android:** Settings → Text-to-speech output → Speech Services by Google → Install voice data →
  English (United Kingdom).

Settings → Voice shows the same tip for the device you're on. **Test voice** plays a short
greeting with the voice you picked.

## What it costs

Jarvis itself is free. You pay Anthropic for what Jarvis uses, at Anthropic's normal prices,
from the credit in your account. Rough examples:

| What you ask | Typical cost |
|---|---|
| A quick question | about 2–6¢ |
| An answer that needs a web search | about 6–16¢ (each web search is $0.01 of that) |
| An 8-agent swarm at the Balanced depth | about $1–2.50, typically around $1.70 |
| A Deep swarm with 20 agents | about $7–15 |
| A 3D hologram | about 10–30¢ (a battery at the low end, a whole car at the high end) |
| A 2D blueprint | about 15¢ (shown on the button before you ask) |
| Reopening a saved hologram or blueprint, hologram commands, Photos | free |

For example, $200 of credit a month covers roughly 100 Balanced swarm missions (more if some
are Fast), with room left over for everyday questions. Follow-up suggestions use the small Claude Haiku model
and cost a tiny fraction of a cent. A photo or PDF you attach is re-read with every later message
in that conversation (at a reduced, cached price), so start a new chat when you change topic.
The instructions for holograms and blueprints are part of what Jarvis sends, so the first message
of a new conversation costs about 3¢ more; later messages reuse them for a tenth of a cent.

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
- **Photos of parts.** When you open **Photos** in a hologram, its search words (the name of the
  object or part, which you can change) are sent to Wikimedia Commons (`commons.wikimedia.org`),
  and the pictures load from `upload.wikimedia.org`. No account, cookies or referrer are sent,
  and nothing else goes to Wikimedia. Photos are searched only when you open them.
- **Holograms and blueprints** you've made are saved on this device only, like your
  conversations, and are included in backups. Deleting a conversation keeps its saved holograms
  and blueprints (delete those in the Blueprints library); **Reset Jarvis** deletes them. If the
  device's storage is full, new ones last only until you close Jarvis, and the storage notice
  says so.
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

### Backups

- **Export backup** (Settings → Data) saves your conversations, memory, preferences, your own
  protocols, statistics and your Blueprints library (holograms and blueprints) in a file. It never
  contains your API key: a conversation that contains an API key (yours or any other) is left
  out, and Jarvis tells you how many were.
- **Import backup** adds the backup's conversations, memory notes and saved holograms and
  blueprints (nothing is deleted) and restores your preferences: name, style, voice, theme and
  sounds. It never changes your models, agent limits or spending warning. Only conversations that Jarvis itself made are imported (any
  others are skipped, and Jarvis says so), and a reply that was still running or interrupted
  comes back as stopped: it can't be resumed.
- **Only import your own backups.** Never import a backup someone else gave you: its
  conversations and memory notes would become part of what Jarvis knows about you, and could be
  written to steer it.

## Settings at a glance

- **Profile & style:** what Jarvis calls you, **Jarvis's style** (Butler, Friendly, Professional
  or Playful) and how long its answers are (Concise, Balanced or Detailed).
- **AI:** the models used (Claude Opus 5.5 leads, Claude Sonnet 5.5 agents by default; Opus or
  Sonnet can lead, and agents can also use the cheaper Claude Haiku), research depth (Fast,
  Balanced, Deep), default mode, agents per wave, how many work at once, how many follow-up
  waves, whether to show Jarvis's thinking, and follow-up suggestions.
- **Voice:** whether answers in the chat are read out (**Off**, **Short summary** or **Whole
  reply**), the voice (best first, marked Premium, Enhanced, Natural or online) and its speed, a
  tip for getting a more natural voice on your device, the language you speak in, and whether
  Voice Mode keeps listening after each reply.
- **Appearance & sound:** six color themes, sounds and their volume, vibration (Android), and a
  notification when a mission finishes while Jarvis is in the background.
- **Location:** optional, for local answers (weather, opening hours, prices).
- **Memory:** everything Jarvis remembers about you; edit or delete any of it.
- **API key & spending:** test, replace or remove your key; this month's estimate; warning
  level; the **Systems dashboard**.
- **Data:** export a backup (conversations, memory, settings, your own protocols, statistics and
  the Blueprints library),
  import one of your own (see [Backups](#backups)), or reset Jarvis on this device.
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
| **Jarvis's voice sounds robotic** | Download a better voice for free: see [A more natural voice](#a-more-natural-voice), then pick it (or leave **Automatic**) in Settings → Voice. |
| **Reading aloud stops, or a voice says nothing** | Jarvis already retries a voice that stalls or drops a sentence, and says so ("The voice stopped responding") when nothing plays at all. Tap **Speak** to try again; if it keeps happening, pick another voice in Settings → Voice. Reading also pauses while the screen is locked or Jarvis is in the background. |
| **No notification when a mission finishes** | Settings → Appearance & sound → **Allow notifications**. On iPhone, notifications only work in the installed app (Share → Add to Home Screen), and iOS may pause Jarvis in the background before the mission ends. |
| **The microphone does nothing** | Allow microphone access for the site (iPhone: the **aA** menu in Safari → Website Settings, or Settings → Apps → Safari → Microphone). Voice input needs the secure `https://` link and isn't available in every browser (for example Firefox). |
| **No "Install" option** | On iPhone use **Safari** (Share → Add to Home Screen); on Android use **Chrome**; on a computer use Chrome or Edge, or Safari's File → Add to Dock. |
| **A spending warning** | Your estimated spending passed the threshold you set. Change it in Settings → API key & spending. |
| **"This device could not start the 3D view"** | 3D graphics (WebGL) are turned off in this browser, for example by Lockdown Mode on an iPhone. The parts list and part cards still work, and so do blueprints. |
| **"The 3D view couldn't load"** | The 3D viewer couldn't be fetched (for example right after an update, while offline). Check your connection and tap **Try again**. Once Jarvis is installed and up to date, holograms open offline too. |
| **Photos don't appear** | Photos need an internet connection (holograms and blueprints don't). If Wikimedia Commons is slow or busy, try again in a moment. |
| **A hologram says "incomplete"** | It was stopped, or the connection dropped, while Jarvis was building it. Ask again (or tap **Resume** if the reply was interrupted). |
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
src/engine/       conversation engine: lead, agent missions, streaming, prompts, holograms and blueprints (visuals.js) (no DOM)
src/platform/     settings, API key, IndexedDB history and the saved library, memory, spend, voice, Wikimedia photo search, PWA helpers
src/lib/          safe streaming Markdown → DOM renderer; hologram and blueprint spec validators and the hologram command matcher (pure)
src/ui/           app shell, chat, composer, sheets; src/ui/hud/ the HUD (core, Mission Control); src/ui/hologram/ the 3D viewer (three.js, loaded on demand); src/ui/blueprint/ the blueprint viewer
src/styles/       design tokens and styles
scripts/          build.mjs, serve.mjs, deploy-pages.mjs, make-icons.mjs
test/unit/        node --test unit tests
test/mock/        strict mock of the Claude Messages API (HTTP handler + in-process fetch; directives in test/mock/README.md)
test/server.mjs   dist/ + mock API on one origin
test/e2e/         Playwright end-to-end scenarios
```

| Command | What it does |
|---|---|
| `npm run build` | Bundles `src/main.js` into `dist/assets/app.js` + `app.css` (minified, source maps, target es2020/safari15), with the 3D viewer and three.js split into lazy chunks in `dist/assets/chunks/`; copies `public/`, stamps the build id and the service worker's precache list (chunks included, so saved holograms open offline), prints sizes. |
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
| `[[droplead]]` / `[[droplead:N]]` | the lead's first response to each request is cut after N frames (default 60); sending it again (Resume) succeeds |
| `[[hologram:battery]]` / `[[hologram:alternator]]` / `[[hologram:camry]]` | a sentence, then `show_hologram` with a realistic sample (AA battery, 9 parts; car alternator, 19; 2024 Camry Hybrid, 43; camry by default), streamed in small chunks over about 3 seconds so the live build shows, then one or two sentences |
| `[[hologram:broken]]` / `[[hologram:huge]]` | `show_hologram` with nothing that can be shown (an error card) / far beyond every limit (capped, with warnings) |
| *(a `Blueprint request` block in `<turn_context>`)* | `draw_blueprint` once, with the best-matching sample sheet and the requested `for` ids, then a sentence |
| `[[blueprint:<sample>]]` | `draw_blueprint` with that sample (`alternator-part`, `battery-cutaway`, `battery-process`, `camry-assembly`), no `for` |
| `[[open-saved]]` | `open_saved` with the first id of the turn context's saved list (an unknown id when it is empty) |
| `[[swarm:N]] [[hologram:x]]` | a Blueprint mission: agents first, then `show_hologram`, then a synthesis with sources |
| *(Voice Mode turn: `Reply channel: spoken` in `<turn_context>`)* | every final answer is written for the ear: two or three plain sentences, a line `---`, then `## Details` with two list items (`[[long]]` puts its whole guide below the line; `[[xss]]` puts every payload there and one in the spoken part). The text streams a few words at a time, 50–90 ms apart, and a search takes about a second, so speech can start mid-reply. `[[search]]`, `[[pause]]` and `[[swarm:N]]` first say "Let me check the latest on that." Holograms and blueprints are said for the ear too: "Pulling up the AA alkaline battery now." before `show_hologram`, "Here's the AA alkaline battery. Say "expand it", or tap any part." after it; "Drawing the blueprint of the separator now.", then "The blueprint of the separator is ready; it's open on your screen." |
| `[[nobreak]]` / `[[longspoken]]` | Voice Mode turns only: a spoken reply with no `---` line or details / a spoken part of about 2,000 characters |

Security rules worth knowing before you change anything: the Content-Security-Policy in
`index.html` is fixed by SPEC §2 (besides `api.anthropic.com`, it allows only the Wikimedia
Commons photo search and `upload.wikimedia.org` images); model, web and user text is rendered only through
`src/lib/markdown.js` (never `innerHTML`); links from model output must be `http:`, `https:` or
`mailto:` and open with `rel="noopener noreferrer"`; and the API key is never logged, put in a
URL, or exported. Shared and downloaded Markdown goes through `safeMarkdown` and
`redactSecrets` in `src/ui/share.js` (no raw HTML, no non-http(s) links, no API keys), and
backups leave out conversations that contain a key.
