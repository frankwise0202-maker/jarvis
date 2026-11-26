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
12. [Jarvis Core: your home base](#jarvis-core-your-home-base)
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
- **Let Jarvis see (Optics).** Point your phone or your Mac's camera (or a USB webcam such as a
  Logitech) at something and tap **Look**: Jarvis tells you what it is (brand, model, readable
  text, the parts of a machine) and pins labels on the picture. Ask follow-ups, tap a label for
  "What's this part?", or say "Hologram of this" to see it in 3D. In Voice Mode, just ask "what am
  I looking at?".
- **Speak with a natural voice, free.** Turn on the **natural voice** (Kokoro, open source) in
  Settings and Jarvis speaks with a neural British voice (George by default) that runs on your own
  device.
- **See how things are built.** Ask "show me a 2024 Camry" or "what's inside an AA battery?" and
  Jarvis builds a glowing **3D hologram** with every part labeled, which you can turn, take apart
  and tap. A **2D blueprint** of a part (or the whole thing) is drawn only when you ask for one,
  everything is kept in your **Blueprints** library to reopen for free, and **Photos** shows real
  pictures of any part. It all works by voice too.
- **Put it on another screen.** "Open this on my other screen" or "float it beside me": a
  hologram, a blueprint, Mission Control, a report or the live camera opens on your second
  monitor, or in a floating panel that stays on top of your other apps, in Jarvis's HUD frame;
  "bring it back" returns it. See [Screens](#screens-your-other-monitor-or-a-panel-beside-you).
- **Find music in Apple Music, free.** "Jarvis, play Back in Black": Jarvis finds the song,
  album or artist in Apple Music and shows it with its artwork; tap **Open in Apple Music** to
  play it in the Music app, or **Preview** to hear 30 seconds right in Jarvis. Ask for
  recommendations ("something for a rainy Sunday") and he picks real songs for you. No account and
  no cost. See [Apple Music](#apple-music).
- **Wake him up.** Put Jarvis on **Standby** (a dim clock that keeps the screen on), clap twice
  or say "Hey Jarvis", and he wakes up: "Welcome home, Frank. Shall I put on some AC/DC? Or I
  can run your evening briefing." Listening happens on your device only, and it's free. See
  [Wake Jarvis (Standby)](#wake-jarvis-standby).
- **Keep an eye on your home base.** With the Jarvis Core running on your Alienware, the home
  screen shows how it's doing (online, OK or a warning, CPU, graphics card, memory, disk) and you can
  ask it "How are you?" for free. See [Jarvis Core: your home base](#jarvis-core-your-home-base).
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
  **Shift+Enter** starts a new line. What you said waits in the message box for 2 seconds before it
  is sent; tap the box to change it first. A command such as "play Back in Black" acts at once (see
  [Talking to Jarvis](#talking-to-jarvis-how-listening-works)).
- **Run a Protocol**: tap a tile under the greeting (scroll down on a phone). Tiles that need a
  topic open a small box for it; **New protocol** saves your own one-tap mission.
- **Show Jarvis a photo or PDF** with the paperclip (or the camera on a phone). Photos are
  resized and their location data removed before they are sent.
- **Voice Mode**: tap the sound-wave button at the top (or the glowing core on the home screen)
  and just talk. Jarvis waits until you have finished (pauses to think are fine), shows what it
  heard for 2 seconds so you can fix a word, then sends it (see
  [Talking to Jarvis](#talking-to-jarvis-how-listening-works)). Jarvis writes its reply for listening (a few natural sentences, no lists or
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

### Talking to Jarvis: how listening works

Jarvis, not your phone, decides when you have finished speaking, so a pause to think doesn't cut
you off.

- **It waits for you.** Jarvis keeps listening until you have been quiet for about 1.6 seconds.
  If you stop on a word like "and", "the", "so" or "um", or after just "Jarvis…", it waits one
  second more. Change how long in Settings → Voice → **Wait after I stop talking**: Short (1
  second), Normal (1.6 seconds) or Long (2.6 seconds, good if you often pause mid-sentence). One
  request can be up to a minute long.
- **On iPhone** Safari's speech recognition stops after every short pause. Jarvis starts it again
  at once and keeps adding your words, so the sentence arrives whole. If you start the sentence
  again from the beginning after a pause, Jarvis keeps listening while you say it again.
- **The 2-second check.** When you have finished, Jarvis shows what it heard in big letters, with
  a ring that fills for 2 seconds, then sends it. Meanwhile you can:
  - **tap the words** to fix them: a text field opens and the countdown stops; tap **Send** when
    it's right;
  - say **"no, I said …"**, for example "no, I said Boston" (or just "no, Boston"): Jarvis
    replaces the word that sounds most like it, or only the words next to the ones you repeat
    ("no, I said for four" changes "for two"; "no, I said oat milk" adds "oat"), or the whole
    sentence if you say it all again, and counts again. When it can only guess which word you
    mean (nothing sounds like it, or there are two numbers), it shows its guess and asks "Is that
    right?": say **"yes"** or tap **Send**, or tap the words to fix them;
  - say **"cancel"** or **"never mind"** (also "no, no, cancel"): nothing is sent;
  - say **"wait"** to stop the countdown, or just keep talking: your words are added;
  - tap **Send now** (or the core) to send it straight away, or **Cancel**.
- **Tap the core while you talk** to send at once, without the check.
- **Commands act at once**, without the check: "expand it", "show the alternator", "put it on my
  other screen", "what am I looking at?", "play Back in Black", "new chat", "open settings" and the other
  hologram, screen, camera, [Apple Music](#apple-music) and app commands ([Everything by
  voice](#everything-by-voice)). They cost nothing, and a misheard song only shows the
  wrong card. While your words are shown, Music cards step aside and no preview plays.
- **The microphone in the chat** puts your words in the message box and sends them after the same
  2 seconds (a ring runs around Send). Tap the box to stop that and change them, then send. A
  command ("play Back in Black", "put it on my other screen") acts at once there too.
- **Don't want the check?** Settings → Voice → **After I stop talking** → **Send right away**.
- **Better recognition.** Jarvis listens in your phone's or computer's language (Settings → Voice →
  **Listening language** → Automatic); pick another one there if you speak to Jarvis in a different
  language or accent. When the speech service isn't sure, Jarvis also checks its other guesses: one
  that names a part of the hologram on screen is used for your question ("the alternate her" → "the
  alternator"), and one that is a command is used only when the command is free and can be undone
  ("new jacket" → "new chat"). Never for the camera, the microphone, a search, a Chrome task, an
  answer to a question, or anything that costs money, and never when what Jarvis heard best is a
  question: those act only on what he heard best. A guess that is a music command is used only when
  what Jarvis heard best is nothing else ("clay Back in Black" → "play Back in Black"). Jarvis also
  keeps a list of the words to expect ("Jarvis", the commands, the hologram's parts), but Chrome only
  uses such a list when it recognizes speech on the device itself, which Jarvis doesn't ask for, so
  today the list changes nothing.

#### Everything by voice

Say these in Voice Mode (after "Hey Jarvis" or two claps from Standby), or type them in the chat box,
a hologram's field or Optics' field: the same words do the same thing everywhere. They act at once,
cost nothing unless the table says so, and Jarvis says one short line so you know what he did ("New
chat.", "Settings are open."). Anything else is a question for Jarvis, as before: it waits 2 seconds
on screen first, and costs what a question costs.

| Feature | Say | What happens |
|---|---|---|
| Voice Mode | "stop talking", "be quiet", "that's enough" | He stops talking |
| | "read the full answer", "read me the rest" | He reads the details too |
| | "repeat that", "say that again" | He says the last answer again |
| | "stop listening" | He stops listening (back to Standby when Standby woke him) |
| | "exit Voice Mode" | Voice Mode closes |
| | "speak slower", "speak faster" | His speed, a step at a time (Settings → Voice) |
| | "turn off continuous", "turn on continuous" | Listening again after each answer, off or on |
| | "send right away", "show me what you heard first" | The 2-second check, off or on |
| | "use George", "use the Mac's voice" | Which voice speaks (George may need his one-time download first) |
| Microphone and speaker | "which microphone are you using?", "is the speakerphone connected?" | Which microphone and speaker Jarvis uses (Mac) |
| Stop | "stop" | Stops whatever runs: a walkthrough pauses; a Chrome task, the live view and a preview stop. Nothing running: "Okay." (With a hologram on screen and nothing running, it holds the model still.) |
| Standby | "go to sleep", "standby", "good night" | Back to Standby, from anywhere (a hologram's field too) |
| Chats | "new chat", "start a new chat" | A new chat (the old one stays in History) |
| | "open history", "show me my history" | History |
| Settings | "open settings", "open the voice settings" | Settings, at that section |
| Library | "open the library", "open my blueprints", "show my saved holograms" | Your saved holograms and blueprints |
| Mission Control | "show mission control" | The mission's agents ("There's no mission to show yet." before one) |
| Home base | "open the home base" | Its sheet (its setup in Settings when none is linked) |
| | "how's the home base?", "brief me", "research … in the background", "what did the home base find?", "watch for … under $300" | As before (the home base pays for research and watches) |
| Spending | "how much have I spent today", "… this month" | A readout of this device's estimates, free |
| | "how much has the live view cost" | The live view's spending this hour |
| Optics | "open optics", "open the camera", "camera on" | Optics opens, no Look ("Tap Look" on an iPhone) |
| | "close the camera" | Camera off, from anywhere |
| | "switch cameras", "use the Logitech camera" | Optics opens on that camera |
| | "what am I looking at?", "look at this", "take a picture", "look again", "new look" | A Look, about 3¢ |
| | "video mode", "start live view" · "video mode off", "stop live view", "that's enough" | The live view on or off (its price: see What it costs) |
| | "expand the picture", "show the picture big", "back to live", "show the live video", "close the picture", "put the picture aside" | The picture and the live video, on a Mac |
| | "research this", "look this up", "dig into this", "research this in the background", then "quick", "mission", "home base" or "cancel" | The price first; nothing is spent until you choose |
| | "look at my screen" | A button to tap (your screen's share picker needs a tap), with a Look's price on it |
| Holograms | "expand it", "show the battery", "front view", "labels off", "photos of the fan" | As before, free |
| Walkthroughs | "walk me through it", "walk me through the battery" | A walkthrough of the hologram on screen, free |
| | "next", "back", "previous", "repeat", "pause", "resume", "continue", "skip to the fan", "take me to the battery", "stop the tour", "end the tour" | Moves through it |
| | "enclosed", "opened", "both", "you pick" | Answers "enclosed or opened?" |
| Screens and windows | "put it on my other screen", "float it", "bring it back" | As before |
| | "put the camera in a window", "put the hologram in another window", "side by side", "camera on the left, hologram on the right" | Windows by voice (see [Windows by voice](#windows-by-voice)) |
| | "close the camera window", "close everything", "do this in this window", "show it here" | That window, all of them, or here |
| | "swap them", "make the camera window bigger", "show me the hologram window", "float yourself" | Swap, resize, raise; Jarvis in a small panel on top |
| Chrome | "pull this up in Chrome", "open the second link", "google USB-C chargers", "open YouTube" | A page in Chrome, free (a search waits 2 seconds on screen) |
| | "find a 4K monitor under $300 and add it to the cart in Chrome", "in Chrome, …", "have Chrome …", "click around for me" | A Jarvis for Chrome task: Jarvis says what it will do and its limit first (see [By voice from Jarvis](#by-voice-from-jarvis)); within 2 minutes, "add the cheapest one to the cart" or "sort by price" too |
| | "approve", "allow once", "deny", "cancel Chrome", "stop Chrome" | Answers Chrome's question (purchases always need a click) |
| | "what are you doing in Chrome?" | The task's latest step |
| | "is Jarvis for Chrome linked?", "link Jarvis for Chrome" | Its status, or its link in Settings |
| Apple Music | "play Back in Black", "stop the music" | As before |

- **One sentence, one place.** When two features could take the same words, the one in front wins: a
  question Jarvis just asked, then "stop", then a place you named (Chrome, a window, a screen), then
  what is on top (a walkthrough, a hologram, Optics), then the app, then music and the home base, then
  the camera. So "go back" during a walkthrough is its previous step (with only a hologram on screen,
  "There's nothing to go back to."), "expand this in a different window" makes a window rather than
  taking the hologram apart, and "open the camera" with a laptop hologram on screen selects its camera
  part ("Say 'open Optics' for your camera.").
- **A bare "cancel" or "no"** answers whatever Jarvis asked last. "Approve" only ever answers Chrome,
  and "continue" never does.
- **Long sentences are questions.** A command is a short whole sentence; more than about 18 words is a
  question for Jarvis, except what carries your own words on (a Chrome task, a song, research for the
  home base).
- **Other guesses** count only for free things you can undo (see Better recognition above).
- **While he talks** he can't hear you, except "Hey Jarvis" or two claps on a Mac (see
  [Hands-free on a Mac](#hands-free-on-a-mac)): interrupt him first, then say the command.
- **Opening something to look at** ("open settings", "open the library") from Voice Mode: Jarvis says
  so, Voice Mode closes, and it opens as if you had tapped it (it doesn't go back to Standby, since you
  asked to look at it).

#### Hands-free on a Mac

With Jarvis on Standby in Chrome on your Mac, you can talk to him from across the room while his window is behind
other windows, minimized, or with the display asleep.

- **He listens and answers in the background.** Wake him ("Hey Jarvis" or two claps): he greets you, hears your
  question and answers out loud, without you switching to his window. A conversation you started with a tap or a
  key goes on the same way when you switch to another app.
- **He says what he's doing.** You hear the wake chime, then a short chime each time he starts and stops
  listening. The tab's title says **Listening · Jarvis**, **Thinking · Jarvis** or **Speaking · Jarvis**. If you
  allowed notifications, one says "Jarvis is listening. Ask away, or say “go back to sleep”." (click it to bring
  Jarvis forward); it goes away when the conversation ends.
- **Chrome's red dot and the Mac's orange dot** are on whenever Standby listens, so they can't tell you whether he
  is waiting for "Hey Jarvis" or hearing your question. The chimes and the title can.
- **After an answer he listens about 8 seconds** for a follow-up. If nobody speaks, he goes back to Standby.
- **The brake.** While his window is in the background, he takes at most 3 questions in a row without "Hey
  Jarvis", two claps, a tap or a key. Then he says "Say “Hey Jarvis” when you need me." and goes back to Standby
  (or just stops listening, if you started with a tap). A TV left on can't run up paid questions.
- **Interrupt him by voice.** While George is speaking, say "Hey Jarvis" or clap twice: he stops and listens (a
  walkthrough pauses at its step). It's free and stays on your Mac. It works with **Speakerphone speaks, Mac
  listens** and **Switch** (Settings → Voice → Microphone and speaker), once the second step of **Test hands-free**
  has passed. His own "Jarvis" never interrupts him: for about a second around it, the wake word doesn't count.
  With **Speakerphone for both**, while the Mac's own voice is speaking, or if that step of the test failed, tap the
  core or press Space, as before.
- **One Jarvis per Mac answers.** If Jarvis is open in two windows (the installed app and a forgotten tab, say),
  only one listens on Standby. The other says "Standby is on in another Jarvis window"; click **Use this window** to
  move Standby there. When the one listening leaves Standby or closes, the other takes over by itself.
- **Turn it off** with Settings → Voice → Wake Jarvis → **Keep talking when Jarvis is in the background (Mac)**.
  Then he greets you from the background and waits for you to switch to him, as before.
- **Standby when Jarvis starts.** With "Hey Jarvis" on, Jarvis opens Standby by himself when he starts (after a
  restart or an update, say). Settings → Voice → Wake Jarvis → **Open Standby when Jarvis starts (Mac)** turns that
  on or off. Chrome lets a page speak only after one click, so until you click, Standby says **CLICK ONCE SO JARVIS
  CAN SPEAK**: that click (or Enter) lets him speak, and Standby stays. If George can already speak (installed
  Jarvis, his voice ready), there is no such line.
- **If he can't hear you in the background** (a Chrome or Mac setting can stop that), he says once "I can't hear you
  while I'm in the background. Click me." and the notification says the same.
- **On iPhone and iPad** nothing changes: he listens only while he is open on screen. On every device the camera and
  the live view stop while Jarvis is in the background.
- **Not yet tried on a real Mac:** this was tested in a browser with simulated sound and a simulated hidden window.
  How well he hears you behind other windows, with the display asleep or the screen locked, and whether "Hey
  Jarvis" interrupts him at your speakerphone's volume, are for you to try.

#### Always on: the Mac checklist

For Jarvis to be listening and speaking on the Mac day and night, with a speakerphone across the room. Jarvis
can't change these himself, so check them once:

- **The Mac on power, with the lid open.** "Speakerphone speaks, Mac listens" and the claps use the Mac's own
  microphone, and a MacBook switches its microphone off while the lid is closed.
- **The Mac mustn't sleep:** System Settings → Battery → Options → turn on **Prevent automatic sleeping on power
  adapter when the display is off**. The display may sleep; the Mac must not (a sleeping Mac hears nothing).
- **Install Jarvis as an app** (the install icon in Chrome's address bar). It gets its own window, and after a
  restart George can speak without you clicking first.
- **Chrome:**
  - the microphone for Jarvis on **Allow on every visit**, not "Allow this time" (that ends after 16 hours, or 5
    minutes after Jarvis stops using it, and Standby then wakes up to MICROPHONE BLOCKED);
  - notifications allowed (Settings → Appearance & sound → Allow notifications);
  - pop-ups allowed for Jarvis;
  - Chrome's Settings → Performance → **Always keep these sites active** → add the Jarvis site.
- **The speakerphone set up:** Settings → Voice → **Microphone and speaker** (below), or the no-setting way:
  System Settings → Sound → Output: the speakerphone; Input: the MacBook's microphone.
- **One Standby per room.** With Standby open on the iPhone and on the Mac, both would answer "Hey Jarvis", and
  you'd pay twice.

### Wake Jarvis (Standby)

"Jarvis, wake up. Daddy's home." Put Jarvis on **Standby**, clap twice (or say "Hey Jarvis"), and
he wakes up, greets you and offers some music or your briefing.

- **Standby** is a dim clock for a charger or a desk: the time, the date, the core breathing
  slowly and one line about what's going on (black, so an iPhone's screen is mostly off). It keeps
  the screen on, and only its own slow core moves: the app underneath rests until you leave.
  Open it with **Standby** on the home screen, by long-pressing the core
  (right-click on a computer) → **Standby**, with Settings → Voice → Wake Jarvis → **Go to
  Standby**, or say "Jarvis, standby" or "go to sleep" in Voice Mode (typing "standby" in the chat
  works too). Tap anywhere (or press Esc) to leave it.
- **While Standby is open, Jarvis listens on this device only.** The red pill at the bottom says
  exactly what for: **LISTENING ON THIS DEVICE · TWO CLAPS · “HEY JARVIS”**. The sound is checked on
  your device and thrown away; nothing is recorded, and nothing is sent anywhere until he wakes.
  Leave Standby and the microphone is off. Whenever the microphone is on, the pill says so.
- **Clap twice** (or snap your fingers twice): two sharp claps about half a second apart (anything
  from a sixth of a second to almost a second works). He wakes about a second after your second
  clap: first he makes sure no third one follows. One clap, three claps in a row, clapping along to
  music or a metronome, knocking, footsteps, a door, music or talking don't wake him. **From across
  the room** works too: he listens for the clap's sharp start and then for the room's echo dying
  away, so the echo of a big room doesn't hide it (tested with simulated rooms, up to about 3 m in
  a living room). **Clap sensitivity** (Settings → Voice → Wake Jarvis) is only about loudness, not
  distance: **High** hears softer claps or claps over a noisy room; if something else keeps waking
  him, **Low**.
- **"Hey Jarvis"**: turn on Settings → Voice → Wake Jarvis → **Say "Hey Jarvis"**. The first time
  Standby opens with it on, it downloads about **15 MB** (Standby shows how far it got; two claps
  work meanwhile); after that it works offline. Say it the way you'd call someone, then a short
  pause. With **Clap twice** off, the microphone stays off until "Hey Jarvis" is ready (the pill
  says **GETTING “HEY JARVIS” READY · MICROPHONE OFF**), and if the download fails it stays off.
- **When he wakes**: the core boots with a chime. If you go on talking ("wake up, daddy's home",
  "Frank's home", "I'm home") he says **"Welcome home, Frank."**; otherwise he greets you for the
  time of day ("Good evening, Frank."; after midnight it's "Good morning", like the briefing). After
  "Hey Jarvis" you can ask a question straight away; after two claps, anything else said in that
  moment isn't sent anywhere (it may just be people talking in the room): he greets you, then
  you ask. Then he offers: "Shall I put on some AC/DC? Or I can run your evening briefing." with an
  **Apple Music card** (the artist you played lately, else Back in Black by AC/DC; on iPhone too)
  and listens:
  - **"Yes"** (or "play it", "sure", "yes, please do"): the card is ready for you: tap **Open in
    Apple Music** (or **Preview** to hear a clip here). Jarvis can't start the music app by himself.
  - **"Brief me"** (or "sure, run the briefing"): he runs the briefing for the time of day and
    reads it to you (that's the first thing that costs anything, like any briefing).
  - **"No"** or **"go back to sleep"** (or "no thanks, go back to sleep", "not now, thanks"):
    "Very good, Frank." and back to Standby.
  - "Yes, play some Miles Davis" or "no, play Highway to Hell" finds that music instead (free).
  - Anything else is a normal question (with the usual 2-second check).
- **Afterwards** he goes back to Standby by himself: when you tap **Exit**, say "go back to sleep",
  or when you say nothing for about 8 seconds after his answer. He also goes back after something went
  wrong (an error, the microphone, a check you paused and left), so he's never stuck for the night with
  Standby not listening. Turn that off with Settings → Voice → Wake Jarvis → **Return to standby after
  a conversation**.
- **The greeting** uses your name (Settings → Profile, also shown in Wake Jarvis as **Greeting
  name**).
- **On iPhone** Jarvis can listen only while he is open on screen, so leave him on Standby on the
  charger (Standby keeps the screen on). If you switch apps or lock the phone, he stops listening
  until you come back (the pill says **MICROPHONE PAUSED**). If Safari wants a tap before it
  listens again, the pill says **TAP ONCE TO START LISTENING**: tap it.
- **On a Mac in Chrome** Standby keeps listening while Jarvis is in a background tab or behind
  other windows (Chrome shows its red recording dot on the tab). Two claps there: you hear the
  chime and the greeting, and he hears your answer there too (see [Hands-free on a
  Mac](#hands-free-on-a-mac)). With **Keep talking when Jarvis is in the background** off, switch to
  Jarvis (or click the notification, if you allowed notifications in Settings → Appearance & sound)
  and answer. If "Hey Jarvis" stops working (its download or its worker failed), Standby tries it
  again by itself, and at once when the network is back. In our measurements the clap
  detector itself used well under 1% of one processor core and "Hey Jarvis" about 7% (on a Linux
  test computer; Chrome's own microphone handling comes on top, and it hasn't been measured on a
  Mac yet).
- **Free**: Standby, the claps, "Hey Jarvis" and the wake routine never ask Claude anything; the
  Apple Music search is free. Only what you ask next costs.
- **Credit**: "Hey Jarvis" uses the pre-trained models of **openWakeWord** by David Scripka,
  licensed **CC BY-NC-SA 4.0** (free for personal, non-commercial use; see
  `public/models/openwakeword/LICENSE.md`). They run on your device with ONNX Runtime, the same
  engine as the natural voice.
- **Honest limits**: the clap detector and the wake word were tested with synthetic claps (near,
  and from across simulated rooms) and synthetic voices (and the wake word with the real models),
  not yet in your room with your voice. Two sharp, noisy bangs about half a second apart with
  silence around them (two snare-drum hits, say) sound like two claps to him. If he misses soft
  claps, try **High**; if he misses you from far away, clap sharper or say "Hey Jarvis"; if he
  wakes by himself, choose **Low**.

### The new look: Jarvis at a glance

Jarvis's home screen now tells you what is going on before you ask.

- **The core** in the middle is Jarvis. One word under it says what he is doing: **STANDING
  BY**, **THINKING**, **WORKING · 3 AGENTS**, **SPEAKING**, **LISTENING**, **OPTICS LIVE** (the
  camera is on), **ANALYZING** (a Look is being answered), **WATCHING 4:32** or **OFFLINE** (the
  same word sits next to the small core at the top). Tap the core to talk (Voice Mode).
- **What needs you**: under your greeting, one line ("Nothing needs you.", "2 agents still
  working on 'EV SUVs'."). When a mission finishes while you're in another chat, stops part way
  or has agents that failed, or your spending passes its warning level, a card appears with one
  button (**View**, **Resume**, **Retry**, **Review**), and a small amber dot shows on the core
  and on the small core at the top. Once you have a habit of running your morning or evening
  briefing, it appears there too when it is due (**Run**).
- **Quick keys**: **Look** (the camera: Optics, below), **Talk** (Voice Mode) and **Brief me** (the
  briefing for this time of day, in a new chat; while your home base's morning briefing is new, it
  opens that one instead, free); on a Mac also **Screen** (Jarvis looks at your
  screen). The suggestion cards under them are there for your first few chats; after that your
  Protocols take their place.
- **What the rings mean**: press and hold the core (right-click on a computer). **SPEND** is
  this month's spending against your warning level (amber above it), **AGENTS** how many are
  working now, **MISSION** a running mission's progress, and two dots show whether the
  microphone and the camera are off, ready or on. Every number is real; one that isn't known
  stays dark.
- **On a computer** the right-hand panel shows the time with a suggested briefing, what needs
  you, and **Systems** (network, microphone, camera, model and spend; click it for the full
  dashboard). A running mission takes the panel over. On wide windows a line at the top shows the
  network, today's spend and the time.
- **The microphone and the camera are never on unseen**: while the microphone key listens, a red
  **MIC** pill appears at the top; tap it to turn the microphone off. In Voice Mode the screen says
  **LISTENING** and the big button stops it. The camera has its own red pill in Optics, and an
  **OPTICS** pill at the top while it shows on another screen (tap it to turn the camera off);
  **WATCH** with its countdown while Watch is on.
- **Settings → Appearance → HUD**: **Density** (**Calm**, the default, or **Full**: labels
  around the core, the line at the top always, and Mission Control's log open), **Motion**
  (**Full**, **Reduced** or **Still**: still pictures, no movement) and the short start-up
  animation (once a session, every launch or never, and **Replay now**).
- Voice Mode and the 3D viewer get the same HUD corners on a computer screen. The display
  lettering (the Rajdhani font) comes with the app: nothing is loaded from anywhere else.

### Holograms and blueprints

- **Ask to see something:** "show me a 2024 Toyota Camry Hybrid", "how does a car alternator
  work?", "what's inside an AA battery?". Jarvis builds a glowing 3D hologram of that exact thing,
  part by part while you watch, with every part labeled. A card appears in the chat: tap **Open**
  to see it full screen (in Voice Mode it opens by itself).
- **Smooth, lifelike shapes:** in new chats, Jarvis draws a car's body from its side, top and front
  outlines (wheel arches included) with the doors, hood and lights lying on it, gives fan blades
  their twist, and rounds off what used to be boxes. Smooth bodies take shape in the background:
  the hologram appears at once and sharpens a moment later, offline too. Holograms you saved
  before look exactly as they did, and older chats keep the old style.
- **Look around:** drag to turn it, pinch or scroll to zoom, and drag with two fingers to move it.
  **Exploded** (or the slider) takes it apart so you can see inside; **Assembled** puts it back
  together. **Labels**, **Rotate**, **View** (front, side, top…), **Parts** (a list of every part)
  and **Reset** are along the bottom.
- **Tap a part** to highlight it and read what it does and what it's made of. Its card also has
  **Photos**, **Isolate** (show only that part) and **Focus** (zoom to it).
- **Say or type commands** in the box at the bottom, or tap its microphone. These happen on your
  device, instantly and for free: "expand it", "put it back together", "show the alternator",
  "isolate the rotor" (or "isolate it" for the part you're looking at), "zoom in on the pulley",
  "labels off", "rotate", "stop", "front view", "photos of the fan", "close". Anything else, like
  "why is the cathode a ring?", goes to Jarvis as a normal question, and the answer appears over
  the hologram. On a small phone with a part's card open, the answer is a one-line strip under
  the title so the hologram stays in view: tap it to read it all.
- **While it builds**, a square **Stop building** button sits next to the microphone. What was
  built so far stays on screen, but an unfinished hologram isn't saved and can't get a 2D
  blueprint: ask again to build the whole thing.
- **2D blueprints are drawn only when you ask:** tap **Build 2D blueprint** on a part's card, tap
  **2D** for the whole object (a first tap shows the price, a second one draws it), or say
  "blueprint the alternator" or "switch it to 2D". You get an engineering sheet with numbered parts, a parts
  list, sizes and notes; zoom in, tap a number to find that part, or download it as an SVG or PNG
  picture. Each new blueprint costs about 15¢, or about 35¢ once the conversation has been quiet
  for 5 minutes (the button shows the estimate first). A part that already has one shows **Open
  blueprint**, which is free; **Rebuild** (with its price) draws a fresh one. Just mentioning a
  blueprint ("no blueprint for now", "skip the 2D") never builds one. Say "close the blueprint"
  or "back to the hologram" to close a sheet.
- **Your Blueprints library** (the **Blueprints** button at the top, or History → **Blueprints**
  on a small phone) keeps every hologram and blueprint Jarvis has made for you, each with a small
  picture. Opening one again is free, needs no internet, and asks Jarvis nothing. You can also
  download or delete them there. When you ask for something you've already seen, Jarvis reopens
  the saved one instead of building it again.
- **Photos** shows real photographs of the object or a part from Wikimedia Commons, with the
  photographer's name and license. A part's photos are searched together with the object's name
  ("alternator rotor", then "rotor"), and you can change the search words. Photos are free (see
  [Privacy](#privacy)).
- **The Blueprint protocol** on the home screen asks "What should I blueprint?", sends a research
  team to find out how that exact thing is built and made, then builds the hologram and explains
  it, with sources. It draws no 2D sheets until you ask.
- **In Voice Mode**, say "show me this car" and the hologram opens over Voice Mode as it builds,
  while Jarvis tells you what you're looking at ("Here's the Camry. Say 'expand it' or tap any
  part."). Then just talk: "expand it" or "show the alternator" happen at once, with a short
  answer ("Expanding.", "Here's the alternator."); "blueprint the alternator" draws that blueprint
  and opens it when it's ready. If you put it more loosely ("alternator blueprint?"), Jarvis
  asks first: "Shall I draw a blueprint of the alternator? It costs about 15 cents." Say yes or
  no. Any other question is answered out loud and shown over the hologram; when the answer has
  more details on screen, **Open in chat** leaves Voice Mode and shows all of it. With
  **Continuous** on, Jarvis keeps listening between commands; otherwise tap the microphone in
  the hologram's command box (while Jarvis is working or talking, that button stops him, like the
  glowing core does). While the hologram is still building, that microphone listens instead:
  "expand it" works on it right away, and a question waits until it's built (to stop the build,
  use **Stop building**). Close the hologram to get back to Voice Mode; "expand it" opens it
  again, for free.
- **Chats from before holograms** (started before this update) can't show them. Ask in a new
  chat: a note at the top of the chat offers **Start one**, and Voice Mode starts a new chat by
  itself. Your old chats stay in History.

#### Walkthroughs

- **"Walk me through it"**, with a hologram on screen (or right after Jarvis showed you one): Jarvis
  talks you through it part by part, and the hologram moves to each part as he starts talking about
  it. It's free, works offline, and works for holograms from your library too.
- **"Walk me through the battery"**: it comes apart, the camera flies in to the battery, glowing, and
  Jarvis asks **"Do you want to see it enclosed, or opened?"** Say **enclosed** (it goes back
  together, the case turns see-through and the battery glows where it sits), **opened** (the cover
  in the way comes off and the camera looks at the battery from that side), **both**, or **you
  pick**. Then he tells you what it is and what sits next to it.
- **While it plays**, say **next**, **back** (or "go back", "previous"), **repeat** ("say that
  again"), **wait** or **pause**, **continue**, **skip to the fan**, or **stop the tour** ("that's
  enough"). They act at once and cost nothing. Outside a walkthrough these words do what they did
  before: "back" alone still turns the hologram to its back view.
- **The walkthrough bar** under the hologram shows what Jarvis is saying, "3 of 8", **Back**,
  **Pause** (or **Play**), **Next** and **End**, and the choice buttons when he asks. On a Mac, ←
  and → step through, Space pauses and plays, and Esc ends the walkthrough (a second Esc closes the
  hologram). Touching or turning the model pauses it; **Play** goes on from that step. On a phone
  the bar keeps the count and the buttons, and the words show over the hologram.
- **Questions on the way**, like "what does that do?" or "is it glued in?", go to Jarvis as normal
  questions (paid like any other, about 3–5¢). He is told which part is glowing and which step
  you're on, so "that" means the part on screen. When he asks "enclosed or opened?", he listens
  for your answer for up to a minute (the buttons and the words work any time after that), and
  asking something else in between doesn't lose your place.
- **"Show it enclosed"** and **"show it opened"** also work without a walkthrough: tap a part (or
  say its name), then say which view you want.
- **In Voice Mode** Jarvis says each step as the hologram moves. He listens only where you're
  expected to answer (his question and the end), so a Bluetooth speakerphone switches less often.
  If you close Voice Mode, the walkthrough goes on in the bar by itself. If Jarvis's window is
  hidden, the walkthrough pauses (and a woken Jarvis can go back to Standby); it goes on when you
  come back.
- **How it's planned:** on your device, from the hologram itself (its parts, groups and shapes).
  Where a part sits and the way in to it are said only when the hologram makes them clear;
  otherwise Jarvis says it's inside the case. For real repair steps, ask Jarvis.

### Screens: your other monitor, or a panel beside you

Say or type it, in the chat, a hologram's command box, the camera (Optics) or Voice Mode:

- **"Open this on my other screen"**, "put the hologram on screen 2", "put the report on my
  second monitor": Jarvis opens it on your other monitor, filling it, in his HUD frame. The first
  time, Chrome asks once whether Jarvis may place windows on your screens (Jarvis explains first).
- **"Pull it up beside me"**, "float it": a floating panel that stays on top of your other apps,
  beside whatever you're working on. Move and resize it as you like. With only one monitor
  connected, "my other screen" floats it here instead.
- **"Open it in a window"**: its own window on the right half of your screen (several at once: see
  Windows by voice below).
- **"Bring it back"** closes that screen and shows it here again; "close the other screen" just closes
  it. With several windows open, the one you name, else the one you're in, else the newest.
- **The camera too**: "put the camera on my other screen" (or "put this on my other screen" while
  the camera is open, "float the camera") shows the live camera there, big, with a red **LIVE**;
  the camera closes here, so only one view uses it. **Camera off** under the picture (or the
  **OPTICS** pill at the top of the main window) turns it off; "bring it back" opens the camera
  here again. On an iPhone it simply opens the camera. With a **Look** on screen (the frozen
  picture with its labels), "put this on my other screen" sends that Look instead: the picture,
  its labels and Jarvis's answer.
- **Jarvis never turns the camera on by himself.** If he offers to show the camera on a screen
  while it's off, you get a **Turn on camera** button; nothing happens until you tap it.

"This" means what you're looking at: the open hologram or blueprint, otherwise the newest card in
the chat (a running mission shows as Mission Control, a finished one as its report). You can also
name it: the hologram, the blueprint, Mission Control, the report, the photo, the camera, the
link ("open the second link in a window"). Live things stay live: a mission keeps moving and an
answer keeps writing on the other screen. Screen commands happen on your device, free.

You can also just ask in your own words ("could you put that report up on my second monitor?"):
Jarvis does it and says so in a sentence ("It's on screen 2, sir."). That works in chats started
after this update; in older chats, use the short commands above.

When you speak a command, Chrome may ask for one tap first: an **Open on screen 2** (or **Float
it**) button appears; tap it. To skip that tap for windows, allow pop-ups for the Jarvis site
(the blocked pop-up icon at the right of Chrome's address bar → Always allow). Floating panels
always need one tap. Safari can't choose a screen or float a panel, so Jarvis opens a window you
can drag across; on an iPhone (one screen) it opens full screen in the app.

#### Windows by voice

- **"Put the camera in a window"**, then **"put the hologram in another window"**: each gets a window of its
  own, named by what it shows (the camera window, the hologram window). Up to four at once; a fifth takes the
  place of the oldest, and Jarvis says which. ("Expand this in a different window" works too.)
- **"Side by side"**, **"camera on the left, hologram on the right"**, **"split the screen"**: Jarvis lays out
  his windows on your other monitor when you have one (and allowed window placement), otherwise beside him on
  this screen. Things you name that aren't in a window yet open first. A new window makes room the same way,
  except for a window you dragged somewhere yourself: that one stays put.
- **He always leaves a strip of his own window in view** (about 320 pixels). On a Mac, a window that is
  completely covered counts as hidden, and hidden stops the camera and a walkthrough.
- **"Close the camera window"**, **"bring the hologram back"**: that one only. **"Close that window"**, **"bring
  it back"**: the window you're in, otherwise the newest one. **"Close all windows"** closes every window;
  **"close everything"** also closes what is open in the main window (Voice Mode stays).
- **Voice follows the hologram**: with it in a window, "explode it", "show the battery", "front view" or
  "isolate it" happen in that window. Photos, blueprints and the parts list still open in the main window.
- **"Do this in this window"** (or "show it here"): the window you're looking at, otherwise the main one; Jarvis
  says which, and that window is "it" from then on. "Show the report here" puts the report in it.
- **"Show me the hologram window"** brings it to the front. **"Swap them"** swaps two windows' places;
  **"make the camera window bigger"** (or smaller), **"fill the screen"** resize it (on Jarvis's screen it still
  leaves his strip; true full screen is the window's own full-screen button).
- **"Float yourself"**: Jarvis himself in a small panel that stays on top of your other apps: his core, what
  he's doing and the words he heard, the most honest sign of him while his window is hidden. Chrome needs one
  tap to open it (a **Float Jarvis** button). One floating panel at a time: it takes the place of a floating
  hologram, and he says so. Browsers without floating panels can't do this.
- Jarvis moves only his own windows: Chrome won't let a page move a floating panel ("drag its corner"), a
  page from another site once it is open, or his own window ("make your window bigger": "I can't resize my own
  window. Drag its corner.").

#### Pull it up in Chrome

- **"Pull this up in Chrome"** (or "open that in a new tab"). "This" is a link on screen, otherwise what you're
  looking at: a Look's label, the live view's summary, or the hologram's name with the part you picked, searched
  on Google; otherwise the links in Jarvis's last answer (with several, the first, and he says so); otherwise your
  last question, searched. With nothing yet: "There's nothing to pull up yet."
- **"Open the second link"**, "open link 3": that link of his last answer (when his last answer has links).
- **"Google USB-C chargers"**, "search for heat pipes in Chrome", "look it up on Google": a Google search. Your
  words go to Google, so Jarvis shows (and says) them for 2 seconds first: "no, I said …" fixes them, "cancel"
  opens nothing.
- **"Open YouTube"**, "go to amazon.com": that site.
- Only browser words open the browser: Chrome, Google, a tab, the browser, a link or a site. "Search for flights to
  Denver" or "look it up online" are still questions for Jarvis. Words about what's on a page ("click the first
  result", "open the cheapest one in Chrome") are jobs for Jarvis for Chrome, never a Google search.
- **An address that would do something just by opening it** (add to a cart, cancel an order, sign you out…) never
  opens by voice. Jarvis shows it and asks "It looks like it adds to a cart. Open it?"; only your click opens it.
- **With the camera, a walkthrough or the live view on screen**, the page opens in a window beside Jarvis instead of
  a tab, so he stays in view ("It's open beside me.").
- **With Jarvis for Chrome linked and online**, the page opens in the Jarvis window, where Jarvis for Chrome can work
  in it (beside Jarvis when something is on screen, without taking the focus). Say **"in my Chrome"** or **"in a
  normal tab"** for your usual Chrome window, with your sign-ins. Not linked: a normal tab. Linked but offline (the
  Jarvis window closed): a normal tab, and he says so once.
- **Pop-ups blocked**: an **Open in Chrome** button appears; one tap opens the page. While Jarvis is hidden he says
  "I couldn't open it: allow pop-ups for Jarvis once."
- **"Close that tab"** closes the last tab he opened.
- Said from a Jarvis tab (not the installed app), the new tab covers Jarvis. If he can't listen while covered, he
  says once that "open it in a window" keeps him in view; that puts the page in a window beside him.
- All of this is free: no request to Claude.

### Apple Music

Type it or say it, in the chat or in Voice Mode (said, it acts at once, without the 2-second check):

- **"Play Back in Black"**, "play Back in Black by AC/DC", "put on some Miles Davis", "play the
  album Rumours", "find the song Yesterday", "open Thriller in Apple Music": Jarvis finds it in
  Apple Music at once and shows a **Music card**: the artwork, the title, the artist, the album
  and year, and a few other versions to pick from ("Also found"). "Play some Queen" shows Queen's
  own top songs (not songs by other artists where Queen is only a guest). This works on iPhone
  too: Apple sends some kinds of music search from an iPhone straight to the Music app, where Jarvis
  can't see the answer, so he asks Apple the way it answers a web page.
- **Open in Apple Music** plays the whole song or album in Apple's Music app (on an iPhone it opens
  the Music app; elsewhere Apple Music on the web, where you can sign in). On a Mac there is also
  **Open in Music app**, which opens it straight in the Music app (Chrome asks once whether it may).
- **Preview** plays Apple's 30-second clip inside Jarvis, with a progress bar; tap again to
  pause. "Play a preview of Hey Jude" starts it straight away; **"stop the music"** stops it.
  A preview and Jarvis's voice never overlap: starting a preview stops Jarvis talking, and Jarvis
  starting to talk (Speak, or a reply in Voice Mode) pauses it. A preview never plays while the
  microphone is listening (it pauses when you tap to talk), or while what you said is shown before
  it is sent (the 2-second check).
- **In Voice Mode**, "Jarvis, play Back in Black" gets one short line ("Here's Back in Black by
  AC/DC. Tap Open in Apple Music to play it.") and the card on screen; Jarvis then waits for your
  tap instead of listening again, so you can tap Preview. When he recommends a few, every card
  shows (scroll them). On small iPhones the card fits above the buttons at the bottom.
- **Recommendations.** Ask in your own words ("play something for a rainy Sunday", "play a song to
  cheer me up", "play the new Taylor Swift song", "what should I listen to while I cook?") and
  Jarvis picks real songs or albums and shows a card for each (this is a normal question, so it
  costs like one; in chats started after this update).

What it can't do: Jarvis can't play full songs itself or control the Music app (that needs an
Apple Music subscription and Apple's developer program), and Apple Music playlists can't be
searched for free, so for "play my workout playlist" he shows the closest albums and songs and
says so. The short commands are free: they never go to Claude, and the exchange is kept in the chat
like any other. Everyday requests that only sound like music ("find the record low for Chicago",
"find the single best laptop", "open the album I shared yesterday") go to Jarvis as usual: "find",
"show" and "open" mean music only with "in Apple Music", "the song", "the album" or "the playlist".
A title with "new", "best", "top" or "latest" in it is free when you name the artist too ("play
New Rules by Dua Lipa"); without one, Jarvis looks it up like a recommendation.

### Jarvis's voice

Jarvis now speaks with **George**, a natural British voice, instead of the iPhone's robot voice.
George is made by your Alienware (the home base) and played on your iPhone or Mac. It's free: it
runs on your own computer at home, and nothing goes to any cloud.

- **It turns itself on, once.** When your iPhone (or your Mac) finds your home base running Jarvis
  Core 1.2 or later, Jarvis switches George on by himself and says so: "Jarvis now speaks with
  George's natural voice, made by your Alienware. Getting it ready…". The Alienware downloads George
  the first time (a few hundred MB, once); the notice shows the download, then says he's ready, with
  **Hear him** to listen. Until he's ready, Jarvis speaks as before.
- **Easy to turn off.** Tap **Turn off** on that notice, or the switch in **Settings → Voice →
  Jarvis's voice**. Once you've turned it off (or on) yourself, Jarvis never changes it again on
  that device. Each device has its own switch: turning George off on the Mac leaves him on for the
  iPhone (the Alienware keeps him for your other devices). If George was turned off on the Alienware
  itself (or by an older Jarvis), a device whose switch is on turns him back on there.
- **You can always see which voice is speaking.** A small label shows it in Voice Mode (also when
  Jarvis wakes from Standby) and next to **Stop** when a reply is read aloud: **George · home base**,
  **George · this device** (the natural voice on the phone itself) or **iPhone voice** (on a Mac:
  **built-in voice**). If the home base stops answering in the middle of a reply, the rest is said by
  the iPhone and the label changes with it. If it isn't answering at all (away from home with the
  Alienware asleep, or a bad network), the iPhone voice speaks straight away instead of after a
  silence, and George is back as soon as the home base answers again.
- **Never left in silence.** Sometimes an iPhone stops a web app's sound without saying so (after a
  call, when headphones connect or disconnect, or while the microphone is busy). If George's sound
  doesn't start, the iPhone voice says the reply after about 3.5 seconds, from where George stopped
  (a word may be said twice, never lost), and the label says **iPhone voice**. If you stop that
  silence yourself after a second or two (a tap on the core in Voice Mode, or **Stop**), Jarvis learns
  from it just the same. The next replies use the iPhone voice straight away. George speaks again:
  - by himself once the sound works again, from the second reply after that, with no tap;
  - or at your next tap that starts Jarvis's voice: **Test** in Settings → Voice → Jarvis's voice, a
    reply's **Speak**, the microphone, or opening Voice Mode. Each of these starts George's sound
    afresh. After he has come back by himself, the first of these taps made while he isn't speaking
    does it once more, in case the iPhone runs his sound without letting it out.

  Waking Jarvis from Standby with two claps or "Hey Jarvis" isn't a tap, so while George's sound is
  stuck the greeting comes straight away in the iPhone voice. Nothing is switched off.
- **Faster first words.** George's first words come from a short first piece of the reply (the
  first part of a sentence), and the rest is made while he speaks, in pieces that each fit inside the
  one before, so there's no pause after a short "Good evening, Frank.". Opening Voice Mode, or coming
  back to Jarvis, wakes George up on the Alienware so he's ready.
- **Settings → Voice → Jarvis's voice** (at the top) shows the voice in use and where it comes
  from, with **Test** (on an iPhone that tap also lets Jarvis play sound). Without a home base it
  offers George on the iPhone itself (free, about 117 MB once; it may be slow on an iPhone, and then
  Jarvis uses the iPhone voice).
- **A better iPhone voice for when George isn't speaking** (free): on the iPhone, open Settings >
  Accessibility > Spoken Content > Voices > English, pick a British voice (Daniel or Arthur, for
  example) and download its Enhanced or Premium version. Jarvis already prefers those automatically.

#### Microphone and speaker (Mac)

Where Jarvis listens and speaks on a computer: **Settings → Voice → Microphone and speaker** (Chrome or Edge on a
Mac; the card isn't there on iPhone).

- **The simplest way needs no setting at all:** on the Mac, System Settings → Sound → **Output**: the speakerphone;
  **Input**: the MacBook's own microphone. That is the recommended setup below, and Jarvis follows it. Every other
  sound of the Mac goes to the speakerphone then; to keep those on the Mac's speakers, choose it in the card
  instead. With nothing chosen in the card, Jarvis follows the Mac's sound settings, as before.
- **Why Bluetooth needs a choice.** While any app on the Mac has the speakerphone's Bluetooth microphone open,
  macOS switches it to its phone-call mode, and everything it plays sounds like a phone call (Apple's support
  article 102217). It switches back when the microphone closes, with a short gap (about a second). Standby keeps
  Jarvis's microphone open all the time, Jarvis closes his question microphone while he speaks, and Standby lets
  go of its own when he wakes. So if Jarvis listens through the speakerphone, George sounds like a phone call
  whenever Standby listens, and the speakerphone flips mode at every turn of a conversation.
- **Three setups** (the card shows them when the speaker or the microphone is Bluetooth):
  1. **Speakerphone speaks, Mac listens** (recommended): George always sounds his best, nothing switches, and
     "Hey Jarvis" can interrupt him. The Mac's microphone hears you less well from across the room, and only with
     the lid open.
  2. **Speakerphone for both:** Jarvis hears you best from across the room. George sounds like a phone call
     whenever its microphone is open (Standby listens all the time, so mostly), with a short gap at each switch.
  3. **Switch** (experimental): the Mac's microphone waits for "Hey Jarvis"; your question is heard on the
     speakerphone's microphone; George answers in full sound. A short gap at each switch.
- **Microphone ▾ and Speaker ▾** list your devices by name and connection ("MacBook Pro Microphone · Built-in").
  Pick one by hand and the setup says **Custom**. Until the microphone is allowed for Jarvis, only **Default** is
  offered, with **Show my devices** (it asks for the microphone once and lets go at once). Everything Jarvis plays
  (George, the chimes, music previews) goes to the one speaker you choose.
- **The tests** (each starts only when you tap it):
  - **Test microphone** (5 seconds): a level bar, what the recognizer heard ("Heard: …"), and "Clap twice now"
    through Standby's own clap detector.
  - **Test speaker:** George says one sentence through the chosen speaker. **Compare:** the same sentence with
    the speakerphone's microphone closed, then open, so you can hear the phone-call mode.
  - **Test hands-free**, three steps: (1) switch to another app and say "testing" within 10 seconds (did Jarvis
    hear you in the background?); (2) George says a sentence with "Jarvis" in it while the wake microphone
    listens (if that wakes him, interrupting him by voice stays off, and the card says why); (3) "Did you hear
    that from the speakerphone?" The results are kept on this Mac and shown on the card.
- **Notes.** When George isn't speaking, the Mac's own voice uses the Mac's sound output (System Settings →
  Sound). "Speakerphone speaks, Mac listens" needs the lid open. Chrome's own microphone setting is
  `chrome://settings/content/microphone` (a page can't open it: the card has a **Copy** button). Chrome 135 or
  later hands Jarvis's recognizer the microphone you chose; with an older Chrome the card says **Set Chrome's
  microphone to …**, because the recognizer then uses Chrome's own choice.
- **When the speakerphone goes away** (turned off, out of range, its battery flat), Jarvis keeps listening on the
  Mac's microphone and the Standby pill says so: **LISTENING ON THE MAC’S MICROPHONE · SPEAKERPHONE
  DISCONNECTED**. George plays on the Mac's speakers meanwhile. When it's back, Jarvis moves back by himself. At
  your next "Hey Jarvis" he says it once before the greeting: "I'm on the Mac's speakers; the speakerphone isn't
  connected." He never says it out loud by himself at night. A Bluetooth switch that only looks like the
  speakerphone leaving changes nothing: it must be gone for about 3 seconds.
- **Standby tries the microphone again by itself** when it's busy or gone: after 2 seconds, 5, 15, a minute, then
  every 5 minutes, also in the background. After the Mac has slept, Standby starts its microphone again.
- **Ask him:** "Which microphone are you using?" (or "which speaker are you using?", "is the speakerphone
  connected?") and he says where he listens and speaks, free.
- **If your microphone sends no sound at all** for 10 seconds (the speakerphone's mute button), the Standby pill
  asks **MICROPHONE MUTED?** until sound comes back.
- **Always on** (the card after it) checks what keeps Jarvis listening day and night: the microphone allowed, the
  speakerphone connected, on power, installed as an app, notifications, the wake words, George ready, your
  questions heard on the chosen microphone and the last hands-free Test; and it lists what a page can't check.
- **The first time Standby runs with a Bluetooth speaker and nothing chosen** it shows one line: "Using a
  Bluetooth speakerphone? Set it up in Settings → Voice."
- **Free, and on this Mac only:** nothing here asks Claude anything, and the choice stays on this Mac (it isn't in
  backups or synced to your other devices: device names and ids are per computer).
- **Honest limits:** this was tested in Chrome with stand-in devices, not yet on your Mac with the speakerphone:
  how George sounds in each setup, how long each switch takes (George waits 0.8 seconds after a Bluetooth
  microphone closes), whether Chrome's echo cancellation follows George to the speakerphone, and what macOS
  reports when the speakerphone drops are for you to try.

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

### The natural voice (free, on your device)

For a voice that sounds less like a robot reading, turn on **Natural voice** in Settings → Voice.
It is Kokoro, an open-source neural voice that runs on your own device: it's free, and what it
says never leaves the device.

- **George** (British) speaks by default; **Lewis**, **Fable** and other voices are in the
  **Speaker** list. **Test natural voice** plays a short greeting, always in the natural voice:
  tapped while it's still downloading or getting ready, it waits and plays once it's ready (tap
  again to cancel); on a device where it's too slow it still lets you hear it. A new speaker
  downloads its voice (about half a megabyte) the first time it's used: if that can't happen
  (you're offline, say), Test and the card say so, and replies use the built-in voice until it can.
- **A one-time download.** The card says how much before anything downloads: about **350 MB**
  on a computer whose graphics chip the browser can use (WebGPU: Chrome on a Mac has it, and
  recent iPhones probably do), about **117 MB** otherwise. It's kept for offline use; **Remove
  download** deletes it.
- **Speed.** With WebGPU the voice runs on the graphics chip, which is fast. If the graphics chip
  can't run it, or is too slow, Jarvis switches to the standard engine by itself (it downloads
  that one too, about 93 MB more). **If it's too slow, Jarvis uses the built-in voice** instead,
  and the card says so; **Try again** measures once more.
- Voice Mode, **Speak** and **Speak replies** all use it once it's on and ready. While it's still
  loading, the built-in voice speaks so you never wait.

### The camera (Optics)

**Optics** lets Jarvis see through your camera. Open it with **Look** on the home screen, the
**camera key** next to the message box (on a phone), **Ctrl/⌘ + Shift + L** on a computer, or
**Look** in Voice Mode. The first time, a short card explains how the camera is used before your
browser asks for permission.

- **Look.** Point the camera and tap **LOOK** (or press **Space** on a computer), with a question in the box
  or without one ("What am I looking at?"). The picture between the corner brackets is exactly
  what Jarvis gets, nothing more (on a phone held sideways the buttons move to the right). The picture freezes, Jarvis answers below it, and
  labels appear on the things it names, each with a line to the object. Jarvis identifies what
  it can: objects, the brand or model when it's visible, text it can read, the parts of a machine.
  Each Look is part of your current conversation, so the chat keeps it too (tap it there to see
  the picture with its labels again). In a chat from before this update, a Look starts a new chat
  so it can have labels (Optics says so); the old chat stays in History. While Jarvis is still
  working in this chat (a long research mission, say), **LOOK** offers **Look in a new chat**
  (the mission keeps going) or **Wait**.
- **Follow-ups.** Under the answer: **Tell me more**; **Hologram of this** (the picture turns into
  a glowing outline while Jarvis builds a 3D hologram of the object, which then opens in the
  hologram viewer; the price is on the button); and, after you tap a label, **What's this part?**
  (the hologram button then names that object too). You can also type a question about the same
  picture; no new picture is taken. Each new question scrolls to the top of the answer so you
  can watch Jarvis answer it, and the answer's heading says **ANALYZING** while it works. **Live**
  takes you back to the camera (on a phone it's next to the question box).
- **Beside the live camera** (computers). On a computer the camera doesn't freeze after a Look:
  the picture, its labels and the answer move into a card at the side while the camera stays
  live, so you can keep holding things up as you read (and the live view, when it's on, keeps
  watching). **Expand** (or "expand the picture") shows the picture big with the live camera in a
  small tile in the corner; **Live**, a click on the tile or "put the picture aside" puts it back
  in its card; **Close** ("close the picture") puts the card away and the camera stays on (the
  Look stays in the chat and in the Optics log).
  - **The same picture or a new Look?** Tell me more, What's this part?, a question that names one
    of the labels, and one "about this picture" are about the picture in the card. Any other
    question goes by what the camera sees now: about the same scene (Watch's measure: no more than
    6% of the picture changed) and it's a follow-up on that picture, with no new picture taken; a
    new scene and Jarvis takes a new Look and says "New look." "Look again", "new look", "take a
    picture" and "what about now?" always take a new one. Each answer is marked: **NEW LOOK** on
    a new picture's answer, **ABOUT THIS PICTURE** on each follow-up.
- **Which camera.** The button under **OPTICS** names the camera in use; click or tap it to see
  every camera this device has: your MacBook's own camera, a **Logitech webcam** or any other USB or
  Continuity camera, and on an iPhone **Back**, **Back Ultra Wide**, **Back Telephoto** and
  **Front**. Jarvis remembers your choice on each device.
  - **Plugging in.** Plug in your webcam while Optics is open and it appears in the list; if it's
    the one you chose last time, Jarvis switches to it by itself. Unplug the camera in use and
    Jarvis goes back to the built-in one and tells you.
  - **On a phone**, **Flip** switches between the back and the front camera with one tap.
- **Mirror image.** The front camera and a webcam pointing at you are shown mirrored, like a
  mirror, so it's easy to hold things up. The picture Jarvis looks at is never mirrored: after a
  Look you see exactly what was sent, so writing reads the right way round.
- **Watch** (the eye key) keeps an eye on the scene for up to 5 minutes: Jarvis looks again only
  when something changes (at most every 10 seconds) and tells you if it's worth saying. The
  countdown and the cost so far are on screen.
- **Live view** (the key next to Watch) is Jarvis watching with you, live, for up to an hour. About
  once a second he looks at the newest picture with Anthropic's small, cheap model (Claude Haiku
  5.5); the picture stays live (it never freezes) and a caption under it says what he sees. When
  something is worth a word (what you're holding up, with the brand and model when he can read
  them; a mistake or a risk in what you're doing) he says it: out loud in Voice Mode or when replies
  are read aloud, never while you're talking or he's already speaking, and at most once every 15
  seconds (the lines in between are only shown, without a sound). Where he can't speak (Voice Mode
  closed and replies not read aloud), a soft chime marks a new line, at most once every 15 seconds
  and never while you're talking. The last five things he said are listed; on a phone only the
  newest shows, so the picture stays clear: tap it to see all five.
  - **Start and stop.** Tap **Live view**, or say or type "live view", "watch me" or "keep
    watching" (or "show me the live view", "resume live view"); stop it with the key, "stop live
    view", "stop watching" or "that's enough". While Watch is on, "keep watching" keeps Watch going.
    It never turns the camera on by itself: the camera must already be live in Optics. In Voice
    Mode with Optics closed, "live view" opens the camera on a Mac where you've allowed it (but not
    while a hologram or blueprint is on screen: then the words are for Jarvis, as "what is this?"
    is); on an iPhone Jarvis asks you to tap **Look**, and the live view starts with that tap.
    Jarvis says "Live view on" only once it is: if the hour's $1 is already spent, or another app is
    using the camera, he tells you that instead.
  - **Questions** work as always ("what brand is this?"): a Look on your usual model, about 3¢,
    kept short while the live view is on (a quick answer). On a computer the Look sits in its card
    beside the live camera and the live view keeps watching; it pauses only while a picture fills
    Optics (one you expanded, or a Look on a phone): "Paused while you look at this", until you tap
    **Live** or say "live view".
  - **$1 an hour, questions included.** The meter is always on screen ("LIVE VIEW · 12 min · 9¢
    this hour · limit $1"). The hour counts the last 60 minutes across every Jarvis tab and window
    on the device, and a reload doesn't reset it (each device has its own hour, and on an iPhone the
    Home Screen app and Safari keep separate storage, so each counts its own). From 90¢ Jarvis looks
    only every 5 seconds, and his looks never take the hour past $1: there the live view pauses and
    tells you when it can go on ("It can go on at 2:41 PM"), with a **Resume** button that works
    from then (or say "resume live view"). Questions you ask while it's on count in the same hour,
    even if you tap **Live** or close Optics before the answer ends. Before each request of an
    answer Jarvis sets aside about the most it could cost (30¢ or so: a long answer with web
    searches) and gives back what it didn't use as soon as the answer is in. When that would take
    the hour past $1 (from about 70¢ spent) he doesn't send it and says so, out loud where he
    speaks: "That would take the live view past its dollar this hour. It can go on at 2:41 PM, or
    say 'stop live view' and ask again." With the live view off, questions are as usual. The looks
    cost about 30–50¢ an hour; questions about 3¢ each.
  - **An hour at most.** After 60 minutes it stops by itself: tap **Live view** to keep going. In
    Voice Mode, or with replies read aloud, Jarvis also says it when the live view stops or pauses
    by itself (the hour is over, the $1 is reached, the camera was unplugged), so his silence never
    means he's still watching. Live view and Watch never run together: starting one stops the
    other.
  - **Off means off.** It stops (it doesn't pause) whenever the camera stops: Optics closed, the
    app or window hidden, the camera unplugged, a hologram over Optics, **Esc**, or the **LIVE**
    pill. It runs only in Optics itself, not in a camera view on your other screen. Offline it
    waits and goes on when you're back; if your Anthropic account's speed limit is reached it says
    "Looking less often" and slows down until a look gets through.
- **Keys on a computer.** **Space** looks, unless a button or the answer has the keyboard: then
  Space presses that button (Watch, a camera in the list, **Tell me more**) or scrolls the answer.
  **Option-F** (Alt-F on Windows) switches cameras, **Option-W** starts or stops Watch and
  **Option-L** the live view. Just
  start typing to ask a question: the letters go into the question box. **Esc** closes.
- **Look at my screen** (computers): one picture of a screen or window you choose, then the
  sharing stops at once. On a Mac the home's **Screen** key does it in one tap, and the camera
  stays off. If you cancel Chrome's "Choose what to share" (or the Mac hasn't allowed Chrome to
  record the screen yet: System Settings › Privacy & Security › Screen Recording), Jarvis says
  so and offers **Try again** or **Use the camera**.
- **On another screen.** "Put the camera on my other screen" or "float the camera" shows the live
  camera on your other monitor or in a floating panel (see Screens above). It's a view: Look,
  Watch and the labels stay here in Optics. With a Look on screen (its picture and labels), "put
  this on my other screen" (or the card's **Other screen**) sends that Look there, picture, labels
  and answer, and Optics stays live here with the camera on: the card folds away and its row in
  the Optics log says ON YOUR OTHER SCREEN. "Bring it back" opens its card here again. (A past
  Look you reopened with the camera off goes there and Optics closes, as before.)
- **In Voice Mode**, tap **Look** to open the camera over Voice Mode and just talk: "What am I
  looking at?", "What is this?", "Tell me more", "Hologram of this", "Flip", "Close the camera".
  Jarvis answers out loud and pins the labels too. On a Mac where you have allowed the camera,
  "what am I looking at?" opens it by itself; on an iPhone Jarvis asks you to tap **Look**, and
  then looks right away with the question you asked. Only a short question that is all about
  seeing does this ("What do you see?", "Look at this", "What am I holding?"): a longer one that
  just starts the same way, like "What do you see as the biggest risk in my plan?", is an
  ordinary question for Jarvis, and the camera stays off. (While a hologram
  is on screen, "what is this?" is about the hologram, not the camera.) The same goes for "look"
  in Optics: "look", "look here", "take a look" and "look at this" are a Look, while "look up the
  weather", "look, I think we should wait" or "look at my calendar for Friday" go to Jarvis.
- **Open by voice.** "Open optics", "open the camera" or "camera on" opens Optics without taking a
  picture, so nothing is spent; "switch cameras" or "use the Logitech camera" opens it on that
  camera. In Voice Mode on a Mac where you've allowed the camera, Optics opens over Voice Mode, and
  Jarvis says "Optics is on." once the camera is live (or why not: "I can't find a camera.", or
  that another app is using it). If Jarvis isn't on screen (another app is in front), the camera
  can't run: he says so and shows a notification, and a click on it brings him up with Optics
  open. On an iPhone, or before you've allowed the camera, he says "Tap Look to turn the camera
  on." Typed in the chat, the words open Optics on any device. "Close the camera" closes it (with Optics
  closed it turns off a camera you put on your other screen). "Video mode" is the live view:
  "video mode", "go into video mode", "stop video mode". With a laptop hologram on screen, "open
  the camera" shows the hologram's camera, and Jarvis reminds you to say "open Optics" for yours.
- **Research this.** Hold something up and say or type "research this" (or "look this up", "dig
  into this", "find out more about this"). Jarvis names it and says what each way costs before
  anything is spent: "Research this coffee mug? A quick answer with a web search, about 10¢. A
  research mission with 8 agents, about $1.70. Or the home base can do it in the background, up
  to $1.25." Say or tap **Quick**, **Mission**, **Home base** or **Cancel** (no home base linked:
  the first two). Mission and Home base go through the 2-second check first. The quick answer is
  a follow-up in this conversation, so it sees the picture; the mission and the home base get the
  thing in words (its label and the answer's first sentence). With nothing looked at yet, Jarvis
  looks first ("Let me look first: about 3¢.") and then asks. "Research this in the background"
  offers only the home base. Outside Optics, "this" is the hologram on screen or what you were
  just asking about. With the live view on, the quick answer counts in its $1 an hour and the
  mission and the home base don't (the offer says so); when a quick answer wouldn't fit in the
  hour, the offer says that instead of offering it.
- **Off means off.** The camera runs only while Optics (or a camera view you put on another
  screen) is open and on screen: the red **LIVE** pill shows it (tap it to turn the camera off),
  and it turns off by itself when you switch apps, lock the phone, minimize that window, or when a
  hologram covers Optics. A camera window on your other screen starts the camera only when you
  just asked for it: if Chrome brings that window back after a restart or a crash, or you reload
  it or open it from your history, it waits with **Turn on camera** and captures nothing until you
  tap it.

### Jarvis for Chrome (beta): Jarvis clicks around for you

**Jarvis for Chrome** is a separate Chrome extension for your Mac: Jarvis works in Chrome tabs for
you. He reads pages, scrolls and follows ordinary links, and **asks you before every step that
changes anything** (a click on a button, typing, a form): "find me a 4K monitor under $300 on Best
Buy and add it to the cart".

- **It lives in its own Chrome profile.** You make a Chrome profile just for Jarvis, with no saved
  passwords or cards, and sign in there only to the sites you want Jarvis to use (never your email
  or your bank). If a web page ever tricks Jarvis, your main accounts are out of its reach. Jarvis
  asks you to confirm this before it takes your key.
- **Install (about 5 minutes, once):** make the Jarvis profile, then in its window download
  **<https://frankwise0202-maker.github.io/jarvis/jarvis-for-chrome.zip>**, unzip it, open
  `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the
  unzipped `jarvis-for-chrome` folder. The step-by-step guide, with the profile steps, is in
  [extension/README.md](extension/README.md#install-on-a-mac).
- **Safety:** Jarvis asks before every step that changes a page, always asks before paying,
  sending, posting or deleting, never types passwords or card numbers (he hands those to you),
  treats what web pages say as information, never as orders, and shows a glowing border with a
  **Stop** button while he works. Each new site needs your permission once.
- **Honest limits:** five rounds of testers attacked it on purpose and about 90 problems were
  fixed, but pages built specially to fool an AI assistant can still find tricks. That is why it
  lives in its own profile and asks before anything that changes a page.
- **Costs:** you set a budget per task (default $1); a task stops and asks before going over it.

#### By voice from Jarvis

##### Linking

Jarvis (in your usual Chrome) and Jarvis for Chrome (in its own profile) can't see each other, on purpose, so they
leave each other messages on your home base. You link them once, on the Mac:

1. Make sure **Jarvis for Chrome 1.1.0 or later** is installed (above; its side panel shows the version at the bottom
   of Settings). To update an older one, download **jarvis-for-chrome.zip** again, replace the unzipped folder, and
   press **Reload** on Jarvis for Chrome in `chrome://extensions`: your key and settings are kept. Your home base must
   be linked too (**Settings → Home base**), with Jarvis Core 1.3 or later, which it installs by itself (or run
   `jarvis-core update` on the Alienware).
2. In Jarvis, open **Settings → Jarvis for Chrome**, press **Link**, then **Copy link code**.
3. In the Jarvis window (the Chrome profile with Jarvis for Chrome), open its side panel, then **Settings → Voice
   from Jarvis**, and paste the code. When Chrome asks, let Jarvis for Chrome reach your home base.
4. Both sides now say **Linked · online**, and Jarvis clears the code from your clipboard. **Test** checks the link
   any time, and so does asking "is Jarvis for Chrome linked?" ("link Jarvis for Chrome" brings you to its settings).

The code works once, for 30 minutes: it holds the key that locks your messages, so don't share it. Keep the Jarvis
window open (it can sit behind other windows): if it's closed, Settings says **Linked · offline**, "pull this up in
Chrome" opens a normal tab instead, and Jarvis tells you he can't reach Jarvis for Chrome rather than start a task
there. **Unlink** on either side ends the link. The link belongs to your Mac: on the iPhone, Settings → Jarvis for
Chrome only points you there.

##### What to say

With the link online, say these to Jarvis (in Voice Mode, or typed in the chat box):

- **A task, with "in Chrome":** "find a 4K monitor under $300 and add it to the cart in Chrome". You can also start
  with "in Chrome, …", "use Jarvis for Chrome to …" or "have Chrome …". Before anything happens, Jarvis shows the
  task on a card and says it back with its price: "Chrome, up to a dollar: find a 4K monitor under $300 and add it to
  the cart. Say cancel to stop." Two seconds after he finishes (five while Jarvis is behind other windows) it starts,
  and he says "Chrome is on it."
  - To stop it from starting, say "cancel", "no" or "stop", or press the card's **Cancel**. **Start now** skips the
    wait. "Yes" or "okay" just lets it count on.
  - To change the words, say "no, I said …".
  - Typed in the chat, the card shows the price and starts after two seconds, with nothing said.
- **"Click around for me":** Jarvis asks "What should I do in Chrome?", and your answer is the task (checked the
  same way).
- **Words for the page:** for two minutes after a page opens in the Jarvis window ("pull this up in Chrome"), after a
  task, or after "click around for me", words that only make sense on a page go to Chrome without "in Chrome":
  - "add the cheapest one to the cart", "click the first result", "scroll down";
  - "sort by price", "filter by brand", "search this site for standing desks", "go back a page";
  - "what's the return policy on this page?".

  "Now add the second one too" carries on in the same Chrome chat. Jarvis's own words stay his: "open the camera",
  "open settings" and "new chat" never go to Chrome, and neither does a question that isn't about the page.
- **While it works:** a card in Voice Mode and in the chat shows the task, its latest step and what it has cost so
  far.
  - Jarvis says the final answer.
  - "What are you doing in Chrome?" tells you the latest step (free).
  - "Stop" or "stop Chrome" stops it at once. The card's **Stop**, ⌘⇧. and the side panel's Stop still work.
- **When Chrome asks something:** Jarvis shows it on a card and says it, in Jarvis for Chrome's own words (never
  words picked out of the page): "Chrome asks: add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com?
  Say approve, or cancel."
  - **Only these words answer it:**
    - "approve", "approve it" or "yes, approve";
    - "allow once" for a new site;
    - "spend more in Chrome" at its budget, "more steps in Chrome" at its step limit;
    - "deny", "cancel Chrome" or "stop Chrome" to say no.

    A plain "yes", "okay", "sure", "go ahead" or "continue" never answers Chrome. "Cancel" or "no" on its own answers
    whatever Jarvis asked last.
  - **A yes counts only within 30 seconds of the question being said in full.** If Jarvis may have heard "no"
    instead, he asks again. Then he says "Approving · say cancel" and waits two seconds (five while he is behind
    other windows): "cancel", "no" or "stop" takes it back.
  - **Purchases always need a click.** So do paying, sending, posting, deleting, account changes and everything else
    Jarvis for Chrome marks. Jarvis and the card say "That's a purchase. It needs a click in the Jarvis window.
    Option-Shift-J opens its side panel."
  - **For now, every step needs a click.** Approving everyday steps by voice comes with the setting **Approve everyday
    steps by voice** in Jarvis for Chrome, after its security review. Until then you can say no by voice, and Jarvis
    tells you where to click.
  - **In the chat,** the card's buttons answer it. Typed words don't.
  - **With Voice Mode closed or on Standby,** a notification tells you Chrome is asking. When you wake Jarvis, he
    starts with "Chrome is waiting for you: …".
- **What it never does:**
  - Start a task from anything but your own words: never from a web page, Jarvis's answers or Jarvis for Chrome.
  - Approve a step without your "approve" or a click.
  - Keep Jarvis awake: a task running in Chrome never stops him from going back to Standby.
- **Costs:** the words above are free. A task is paid with Jarvis for Chrome's own key, at its model's price, within
  its budget (a dollar unless you changed it); it asks before going over.

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
| A 2D blueprint | about 15¢, or about 35¢ once the conversation has been quiet for 5 minutes (shown on the button before you ask) |
| Reopening a saved hologram or blueprint, hologram commands, Photos | free |
| A walkthrough ("walk me through it") and its words (next, back, enclosed…) | free; a question you ask on the way costs what a question costs |
| A Look with the camera (Optics) | about 2–3¢ on Opus 5.5 (about 8¢ for the first one in a new or quiet conversation); shown under the LOOK button |
| A follow-up about the same picture (Tell me more, What's this part?) | about the same as a quick question |
| Hologram of this | the price of a hologram, about 10–30¢ (shown on the button) |
| Watch | about 0.6¢ each time Jarvis looks again, at most about 17¢ for a 5-minute session; up to 60 looks a day |
| Live view (Optics) | about 30–50¢ an hour for the looks (one a second on the small, cheap model), which never take the hour past $1; questions asked while it's on (about 3¢ each, kept short) count in the same hour, and one whose worst case (about 30¢, set aside while it's answered) would take it past $1 isn't sent: Jarvis says so. Each device has its own hour (on an iPhone the Home Screen app and Safari each have their own) |
| Research this (Optics) | the price is said first, and nothing is spent until you pick: a quick answer with a web search about 10¢ (6–16¢); a research mission at your team size and depth (8 agents at Balanced, about $1.70); the home base up to $1.25 a job ($3 in depth). With the live view on, only the quick answer counts in its hour |
| Opening Optics by voice ("open optics", "camera on") | free (no picture is taken) |
| Commands, said or typed ("new chat", "open settings", windows, "pull this up in Chrome", "which microphone are you using?") | free (see [Everything by voice](#everything-by-voice)) |
| A Jarvis for Chrome task by voice ("… in Chrome") | paid by Jarvis for Chrome with its own key, within the task's budget (a dollar unless you change it there): Jarvis says the limit before it starts. Linking and the messages through your home base are free |
| The natural voice | free (it runs on your device) |

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
- **Camera (Optics).** The camera is on only while Optics, or a camera view you put on another
  screen, is open and on screen, with a red **LIVE** showing; it turns off when you switch apps,
  lock the phone, close it or minimize its window. A camera view on another screen sends nothing
  anywhere. A picture goes to Anthropic only when you tap **Look** (or say "what am I looking
  at?"), when Jarvis takes one fresh look you asked for while the camera is live, while
  **Watch** is on (you start it, it shows a countdown and stops after 5 minutes), or while the
  **live view** is on: then a picture goes to Anthropic about once a second, only while it's on (you
  start it, its meter is on screen, it stops after an hour or whenever the camera stops). There is
  no video stream anyone could log into: each picture goes straight from your device to
  Anthropic's API, one at a time. Anthropic keeps API data only for a limited time (by default it
  deletes it within 30 days; longer only if a request is flagged under its usage policy or the law
  requires it) and doesn't use it to train its models. Nothing of the live view is recorded or
  saved by Jarvis or by the home base (only the short lines Jarvis said stay on screen until you
  close Optics). Jarvis never
  turns the camera on by himself: if he offers to show it on another screen while it's off, you
  get a **Turn on camera** button, and nothing happens until you tap it. Pictures are made fresh from
  the camera, so they carry no location data. Each Look is kept in the conversation on this device
  (and in backups), like a photo you attach. Jarvis never names people from their faces. Which
  camera you chose last is remembered in this browser's settings.
- **The natural voice** runs entirely on your device: what it says is never sent anywhere. Its
  files come once from the Jarvis site itself (GitHub Pages), not from a third party.
- **Photos of parts.** When you open **Photos** in a hologram, its search words (the name of the
  object, or of the part with the object's name, such as "alternator rotor" and "rotor"; you can
  change them) are sent to Wikimedia Commons (`commons.wikimedia.org`),
  and the pictures load from `upload.wikimedia.org`. No account, cookies or referrer are sent,
  and nothing else goes to Wikimedia. Photos are searched only when you open them.
- **Apple Music.** When you ask for music, the words searched (such as "back in black") go to
  Apple (`itunes.apple.com`), with your country taken from your device's language settings; the
  artwork loads from Apple's `mzstatic.com` and previews from `audio-ssl.itunes.apple.com`. No
  account, cookies or referrer are sent (not even cookies your browser has for Apple), and nothing
  else goes to Apple. Opening a song in Apple Music is between you and Apple.
- **Holograms and blueprints** you've made are saved on this device only, like your
  conversations, and are included in backups. Deleting a conversation keeps its saved holograms
  and blueprints (delete those in the Blueprints library); **Reset Jarvis** deletes them. If the
  device's storage is full, new ones last only until you close Jarvis, and the storage notice
  says so.
- **The core's voice band** follows how loud your voice is while Voice Mode listens. That is
  measured on your device from the microphone Voice Mode already uses; nothing is recorded or
  sent, and it stops when Voice Mode stops listening or you switch away (not used on iPhone yet).
- **What needs you** (finished missions you haven't seen, briefings) and your HUD choices are
  stored on this device only; the HUD choices are included in backups.
- **Standby (Wake Jarvis).** While Standby is open, the microphone listens on this device for two
  claps and, if you turned it on, "Hey Jarvis". The sound is checked on the device and thrown
  away: nothing is recorded or sent, and the red **LISTENING ON THIS DEVICE** pill shows it the
  whole time (the pill says whenever the microphone is on; with only "Hey Jarvis" on, the
  microphone stays off until it is ready). Leaving Standby turns the microphone off. On a phone it
  also stops while Jarvis is not on screen; on a Mac it keeps listening in a background tab while
  Standby is open. When he wakes, Voice Mode takes over as usual (your browser's speech service
  hears what you say next; on a Mac that goes on while his window is in the background, with the
  chimes and the tab's title saying when he listens: see [Hands-free on a Mac](#hands-free-on-a-mac),
  and Settings → Voice → Wake Jarvis to turn it off); woken by claps, words heard in that first moment are not sent to
  Claude (they may be the room talking). The "Hey Jarvis" models download once from the Jarvis
  site itself, and what you played lately (for the music he offers, with Apple's ids for it)
  stays on this device.
- **Location** is never used unless you type one into Settings (it helps with local questions).
- **Photos** you attach are shrunk and stripped of their location data before they are sent.
  Like the rest of the conversation, they are kept on this device only (and are included in
  backups).
- **Jarvis for Chrome through your home base.** Once you link Jarvis for Chrome, Jarvis and the extension leave
  each other messages on your home base: the home base relays encrypted messages it can't read, kept 2 minutes in
  memory (never on its disk or in its log). The key that locks them is made on your Mac and kept only in this
  browser (like your API key: see "Who can read your key") and in the extension; it is never in backups or sync, so
  the home base never has it.
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
  blueprints (nothing is deleted) and restores your preferences: name, style, voice (the natural
  voice's speaker too, though the natural voice stays off until you turn it on), theme and
  sounds, Wake Jarvis (two claps, their sensitivity, back to Standby; "Hey Jarvis" stays off
  until you turn it on, because it is a download) and your home base's address (only on a device with
  no home base linked: an import never unlinks this device or changes its address). It never changes your models,
  agent limits or spending warning. The camera you chose in
  Optics, and the microphone and speaker you chose (Settings → Voice → Microphone and speaker), are not in a backup:
  they belong to that browser. Only conversations that Jarvis itself made are imported (any
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
- **Voice:** at the top, **Jarvis's voice**: the voice in use and where it comes from, **Test**,
  George's voice from the home base on or off, and the ways to a better voice (see
  [Jarvis's voice](#jarviss-voice)). Then whether answers in the chat are read out (**Off**, **Short summary** or **Whole
  reply**), the voice (best first, marked Premium, Enhanced, Natural or online) and its speed, a
  tip for getting a more natural voice on your device, the free **natural voice** (on or off, the
  speaker, Test, its download; the camera is chosen in Optics itself), the language you speak in
  (Automatic: your device's), how long Jarvis waits after you stop talking (Short, Normal, Long),
  whether it shows what it heard for 2 seconds before sending it (or sends right away), whether
  Voice Mode keeps listening after each reply, and **Wake Jarvis** (Standby: two claps and their
  sensitivity, "Hey Jarvis" with its 15 MB download, the greeting name, back to Standby after a
  conversation, and **Go to Standby**).
- **Appearance & sound:** six color themes, the **HUD** (Calm or Full, motion, the start-up
  animation), sounds and their volume, vibration (Android), and a notification when a mission
  finishes while Jarvis is in the background.
- **Location:** optional, for local answers (weather, opening hours, prices).
- **Memory:** everything Jarvis remembers about you; edit or delete any of it.
- **API key & spending:** test, replace or remove your key; this month's estimate; warning
  level; the **Systems dashboard**.
- **Home base:** your Jarvis Core's address (Save, Test, Remove); see
  [Jarvis Core: your home base](#jarvis-core-your-home-base). Below it, **Hearing and voice
  (beta)**: Whisper and George's voice from the home base, each on or off for this device (see
  [Hearing and voice from your home base](#hearing-and-voice-from-your-home-base-beta)).
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
| **Jarvis speaks with the iPhone voice, and Settings → Voice says "George's sound didn't start on this iPhone"** | The iPhone stopped Jarvis's sound for George (after a call, a change of headphones or speaker, or the microphone), so Jarvis switched to the iPhone voice rather than leave you in silence. Tap **Test** in Settings → Voice → Jarvis's voice: the tap starts George's sound afresh, and if the iPhone lets it play, George speaks again. He also comes back by himself once the iPhone plays his sound again. If Test still ends in the iPhone voice (or the Test in Settings → Home base → Hearing and voice says "Nothing played"), the iPhone is still holding the sound back: close Jarvis completely and open it again. |
| **The label says George, but you hear nothing** | After a call or Siri, an iPhone can keep Jarvis's sound running without letting any of it out, and Jarvis can't tell. Tap **Test** in Settings → Voice → Jarvis's voice (or **Speak** on a reply): if George's sound had stopped earlier (the iPhone voice took over), that tap starts it afresh. If you still hear nothing, close Jarvis completely (swipe it away) and open it again. |
| **Jarvis's voice sounds robotic** | Download a better voice for free: see [A more natural voice](#a-more-natural-voice), then pick it (or leave **Automatic**) in Settings → Voice. |
| **Reading aloud stops, or a voice says nothing** | Jarvis already retries a voice that stalls or drops a sentence, and says so ("The voice stopped responding") when nothing plays at all. Tap **Speak** to try again; if it keeps happening, pick another voice in Settings → Voice. Reading also pauses while the screen is locked or Jarvis is in the background. |
| **No notification when a mission finishes** | Settings → Appearance & sound → **Allow notifications**. On iPhone, notifications only work in the installed app (Share → Add to Home Screen), and iOS may pause Jarvis in the background before the mission ends. |
| **Two claps don't wake Jarvis** | Check that Standby's pill says **LISTENING ON THIS DEVICE · TWO CLAPS**. Clap sharply, twice, about half a second apart, then wait a second (he checks that no third clap follows). Soft claps or a noisy room: Settings → Voice → Wake Jarvis → **Clap sensitivity** → **High**. From far away the sensitivity doesn't help: clap sharper, or say "Hey Jarvis". On iPhone Jarvis must be open on screen. |
| **Jarvis wakes up by himself** | Settings → Voice → Wake Jarvis → **Clap sensitivity** → **Low**, or turn off **Clap twice** and use "Hey Jarvis". Woken by claps, he never sends what the room is saying anywhere; he greets you and waits. |
| **"Hey Jarvis" doesn't wake him** | Wait until Standby's pill names “HEY JARVIS” (the first time it downloads about 15 MB). Say "Hey Jarvis" clearly and pause; closer to the device works better, and loud music in the room makes it harder. Two claps always work too. |
| **George sounds like a phone call (Mac, Bluetooth speakerphone)** | The speakerphone's Bluetooth microphone is open, so macOS put it in its phone-call mode. Choose **Speakerphone speaks, Mac listens** in Settings → Voice → Microphone and speaker (or, with no setting: System Settings → Sound → Input: the MacBook's microphone). **Compare** in that card plays the difference. |
| **The Standby pill says SPEAKERPHONE DISCONNECTED** | The speakerphone is off, out of range or out of battery. Jarvis listens on the Mac's microphone meanwhile and moves back by himself when it's connected again (check that it's on and paired in the Mac's Bluetooth settings). |
| **The Microphone and speaker card says "Set Chrome's microphone to …"** | This Chrome can't hand its recognizer the microphone you chose (Chrome before 135). Update Chrome, or paste `chrome://settings/content/microphone` into a new tab and choose the same microphone there. |
| **Standby says NOT LISTENING on the Mac** | Another app may hold the microphone (a call), or the Mac just woke up: Standby tries again by itself (after 2 s, 5 s, 15 s, a minute, then every 5 minutes). MICROPHONE BLOCKED means Chrome's permission: choose **Allow on every visit** (see [Always on: the Mac checklist](#always-on-the-mac-checklist)). |
| **Jarvis stops listening before I have finished** | Settings → Voice → **Wait after I stop talking** → **Long** (2.6 seconds). Pausing on "and" or "um" already gives you a second more. In Voice Mode you can also just keep talking while your words are shown: they are added. |
| **Jarvis hears the wrong words** | Check Settings → Voice → **Listening language**: Automatic uses your device's language; pick yours if you speak another language or accent. Fix a word before it is sent: tap the words, or say "no, I said …". Speaking a little closer to the phone helps too. |
| **I don't want the 2-second check** | Settings → Voice → **After I stop talking** → **Send right away**. A tap on the core while you speak also sends at once. |
| **The microphone does nothing** | Allow microphone access for the site (iPhone: the **aA** menu in Safari → Website Settings, or Settings → Apps → Safari → Microphone). Voice input needs the secure `https://` link and isn't available in every browser (for example Firefox). |
| **No "Install" option** | On iPhone use **Safari** (Share → Add to Home Screen); on Android use **Chrome**; on a computer use Chrome or Edge, or Safari's File → Add to Dock. |
| **A spending warning** | Your estimated spending passed the threshold you set. Change it in Settings → API key & spending. |
| **"This device could not start the 3D view"** | 3D graphics (WebGL) are turned off in this browser, for example by Lockdown Mode on an iPhone. The parts list and part cards still work, and so do blueprints. |
| **"The 3D view couldn't load"** | The 3D viewer couldn't be fetched (for example right after an update, while offline). Check your connection and tap **Try again**. Once Jarvis is installed and up to date, holograms open offline too. |
| **Photos don't appear** | Photos need an internet connection (holograms and blueprints don't). If Wikimedia Commons is slow or busy, try again in a moment. |
| **A hologram says "incomplete"** | It was stopped, or the connection dropped, while Jarvis was building it. An incomplete hologram isn't saved and can't get a 2D blueprint. Ask again (or tap **Resume** if the reply was interrupted). |
| **"Show me …" gives no hologram in an older chat** | Chats started before holograms existed can't show them. Tap **Start one** in the note at the top of the chat, or start a new chat. |
| **"Allow the camera"** in Optics | Camera access is blocked for Jarvis. Optics shows the steps for your device. On a Mac in Chrome also check System Settings → Privacy & Security → Camera → Google Chrome. **Take a photo instead** uses the phone's camera app. |
| **My Logitech (or other USB) webcam isn't in the camera list** | Plug it in while Optics is open; it appears by itself. If it doesn't, unplug it and plug it in again, and close other apps that use the camera (a video call). On a Mac, allow Chrome in System Settings → Privacy & Security → Camera. |
| **The camera picture looks mirrored** | Only the live picture of a camera that faces you is mirrored, like a mirror. What Jarvis looks at, and the frozen picture with the labels, are the right way round. |
| **The natural voice says "Too slow on this device"** | Jarvis measured that this device makes the voice more slowly than it speaks, so the built-in voice speaks instead. Tap **Try again** (for example after closing other apps). |
| **The natural voice download stopped** | Check the connection and tap **Try again**; what was already checked isn't downloaded again. Turning it on asks the browser to keep the download; if the phone runs low on space it may still remove it. |
| **"Can't reach the home base. Is Tailscale switched on here, and is the Alienware on?"** (**OFFLINE**) | Nothing answered. Open the Tailscale app on this iPhone or Mac and switch it on (same account as the Alienware). Check that the Alienware is on and awake, and that its screen shows the report. Then tap **Try again** on the tile. |
| **The home base says "CORE DOWN"** | The Alienware answered, but Jarvis Core on it isn't running. This happens for a moment while it updates, restarts or starts up after a reboot, and it restarts by itself. If it lasts, type `jarvis-core restart` on the Alienware (`jarvis-core status` shows what's wrong). Rarely, it means Jarvis was opened from an unusual address: use <https://frankwise0202-maker.github.io/jarvis/>. |
| **The home base says "REFUSED"** | The Core answered and refused this page (the tile says why). Open Jarvis from its usual address (<https://frankwise0202-maker.github.io/jarvis/>) on a device signed in to your Tailscale, and check the address in Settings → Home base. |
| **Something looks stuck** | Reload the page. Your conversations are saved. |
| **Start completely fresh** | Settings → Data → **Reset Jarvis**. This deletes everything on this device, including your key and the natural voice download. |

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

## Jarvis Core: your home base

Your **home base** is the Jarvis Core: your Alienware at home, running around the clock with a live
system report on its screen and a small status assistant you can ask "How are you?". It is free (it
never uses Claude or your API key), and only your own devices can reach it, through Tailscale, the
private network that links your iPhone, your Mac and the Alienware.

- **Install it on the Alienware:** follow the step-by-step guide in [core/README.md](core/README.md)
  (one command to paste, then switching on Tailscale).
- **Link Jarvis to it:**
  1. Install the **Tailscale** app on your iPhone and Mac and sign in with the same account as on the
     Alienware. Leave it switched on.
  2. Find your home base's address. It ends in `.ts.net`, like
     `https://alienware.tail1234.ts.net/`: the installer shows it when it finishes, and typing
     `jarvis-core url` on the Alienware shows it again.
  3. In Jarvis: **Settings → Home base**, paste the address and tap **Save**. Jarvis tests it and
     shows the computer's name, the Core's version and its health ("health OK: All systems
     normal"). **Test** checks it again; **Remove** unlinks it.
- **What you see:** a **Home base** tile on the home screen (on a computer, in the panel on the
  right): online or offline, **OK**, **WARNING** or **ALERT** with the Core's one-line summary, and
  its CPU, graphics card temperature ("driver not loaded" until the NVIDIA driver is installed), memory
  and free disk space. It checks every 30 seconds while the tile (or, on a computer, the **CORE**
  reading at the top or the Systems panel) is on screen, and never shows a number the Core didn't
  report. Back after a while away, it shows **CONNECTING** and when it last reached the home base
  until it has fresh readings. **Try again** shows **CHECKING…** while it checks.
- **Ask it:** tap **Ask the home base** on the tile, or type or say "How's the home base?", "How's
  the Alienware?", "Home base status" or "Can you check the home base?" in the chat or in Voice Mode.
  The Core answers itself: free, no Claude request.
- **OFFLINE: "Can't reach the home base. Is Tailscale switched on here, and is the Alienware on?"**:
  switch Tailscale on in its app on this iPhone or Mac, and check that the Alienware is on and awake.
  If Chrome on your Mac asks whether Jarvis may access devices on your local network, choose
  **Allow**: that is how it reaches the home base.
- **CORE DOWN**: the Alienware answered but Jarvis Core isn't running. It restarts by itself (an
  update or a reboot takes a moment); if it lasts, type `jarvis-core restart` on the Alienware.

The address travels in your backups: importing one fills it in only on a device with no home base
linked (it never unlinks or changes a linked one). Your phone and computer apps work exactly as
before without a home base.

**A note on security:** to reach your home base, Jarvis's security policy lets the app talk to any
`https://….ts.net` address (Tailscale names), so the address can be pasted on any device. Jarvis
itself only contacts the address you save (or test in Settings). The trade-off: should a bug ever let foreign
code run inside Jarvis, that policy would not stop it from sending data to someone else's `.ts.net`
address, as it stops other sites.

### Your home base can now work for you

With Jarvis Core 1.1 on the Alienware (it updates itself, or type `jarvis-core update` there), your
home base does things for you while your phone is locked: it researches questions, keeps an eye on
things you're waiting for, and has a **morning briefing** ready when you wake up.

**Set it up once (Settings → Home base, below the address):**

1. **Give the home base your key.** One tap sends the Claude key this iPhone already has to your home
   base, over Tailscale. It is kept there in a private file, never shown again (you only see its last
   four characters, like `…Ab3D`), never written to any log, and only ever sent to Anthropic. **Remove**
   takes it off the home base. Without a key the free parts still work: the briefing (weather,
   headlines, how the night went) and the system report.
2. **Spending limits.** What the home base may spend on its own: **$5 a day** and **$50 a month** to
   start. It won't start anything new past a limit, and research that reaches one stops with what it
   has. This is separate from what Jarvis spends on your phone.
3. **Morning briefing.** On at **7:00**. Tap **Use this iPhone's location** for the weather (it is
   rounded to about a kilometre before it leaves the phone), or type a city. °F or °C.
4. **Notifications.** Tap **Turn on notifications** and allow them: the home base then tells this
   iPhone when research is done, something you're watching happens, or your briefing is ready, even
   with Jarvis closed. **Send a test** shows one. On an iPhone this works in the Jarvis app on your
   Home Screen (Share → Add to Home Screen), not in a Safari tab.

**Using it.** Tap **Briefing & research** on the home base tile (on a computer, in the panel on the
right). Four tabs:

- **Briefing:** this morning's briefing, with links to the headlines. **Make a new one now** if you
  want a fresh one.
- **Research:** type a question, pick **Quick** (a few minutes) or **Deep** (reads more, costs
  more), tap **Start research** (or the keyboard's send key). You can lock your phone: the home base
  keeps going and notifies you.
  Tap **Open** on a finished one to read it with its sources; **Cancel** stops one that's running.
- **Watching:** "Tell me when… the LG 27GP850 drops under $300". Choose how often it checks (every 6
  or 12 hours, or once a day). It notifies you once, when it happens. **Check now**, or the bin to stop.
- **Spending:** today and this month against your limits, and the last 30 days.

**Or just say it,** typed in the chat or said in Voice Mode (free, no Claude request from your phone):

- "Research the best espresso machines under $500 **in the background**" (or "home base, research …";
  add "in depth" for deep research)
- "**What did the home base find?**"
- "**Watch for** the LG 27GP850 dropping under $300", "**Tell me when** the PS6 is announced" or
  "**Home base, keep an eye on** …". Without the words "home base", Jarvis only takes it as a watch
  for something clear to wait for (a price under an amount, back in stock, on sale, comes out, is
  released or announced), so an everyday question like "tell me if this email sounds rude: …" or
  "let me know if it's cheaper to fly or drive" is answered by Jarvis as always, never turned into a
  daily check that costs money.
- "**Brief me**" or "**Morning briefing**": the home base's briefing; in Voice Mode Jarvis reads it
  to you. Woken from Standby, "brief me" reads the home base's briefing too. If the last one is more
  than 3 hours old, the home base writes a new one; with your key that's the full briefing, which the
  home base pays for, so its reply is labelled **Home base** rather than **Free · Home base**. If the
  home base can't be reached (Tailscale off on the phone, the Alienware asleep) or still runs Jarvis
  Core 1.0, Jarvis briefs you himself, as before.

With no home base linked, these commands don't exist: what you type or say goes to Jarvis as before.

**In the morning** the briefing waits at the top of the home screen until you read it or close it
(×), and the 7:00 notification opens it (also when Jarvis is in Standby: Standby makes way). While
that briefing is new, the **Brief me** key and the rail's suggestion open it too, free, instead of
writing another. If the home base can't be reached, or still runs Jarvis Core 1.0, the sheet says so
plainly; nothing else changes.

### Your iPhone and your Mac, in sync

Once a home base is linked, Jarvis keeps your devices in step through it: a conversation you had on
the iPhone is on the Mac too (and the other way round), with your saved holograms and blueprints and
what Jarvis remembers about you. The home base also keeps a backup of each device for every day of the
last two weeks, on the Alienware's drive.

- **It just happens.** A few seconds after Jarvis opens, then every 10 minutes while it's open, and two
  minutes after you change something. **Settings → Home base → Your devices, in sync** shows when it
  last synced, which other devices the home base has, and **Sync now**.
- **It only ever adds.** Something new on one device appears on the other (remembered facts as long
  as there's room: Jarvis keeps 100, and syncing never pushes one out). Nothing is ever deleted by
  syncing: delete a conversation on the iPhone and it stays deleted there (it never comes back), while
  the Mac keeps its copy until you delete it there too. If you carried on the same conversation on
  both devices before they synced (or a reply that was cut off finished on one of them), you keep
  yours and get the other one next to it, named "… (from Mac)". That copy follows the Mac; if you
  carry it on here, your new turns are never lost: at the next sync it becomes a conversation of its
  own, "… (from Mac, continued on iPhone)", which syncs like any other.
- **Your API key never travels.** The backup is the same as **Settings → Data → Export** (which never
  includes the key), and the home base refuses anything that looks like a key anyway. Settings stay
  per device (each keeps its own voice, theme and limits).
- **Off switch.** "Keep this device in sync through the home base" turns it off for that device.
- If the home base can't be reached, Jarvis says so and tries again later. A home base still on Jarvis
  Core 1.0 asks you to run `jarvis-core update`. A device whose backup is over 50 MB (usually many
  photos in conversations) still receives the others' conversations, but can't send its own; the card
  says so.

### Hearing and voice from your home base (beta)

The iPhone's own speech recognition isn't the best at catching the right sentence, and the natural
voice can be too much work for a phone. Your Alienware can do both instead: **Whisper** hears what you
say, and **George** (the natural voice) speaks the replies. Both are free: they run on your own
computer at home, and nothing goes to any cloud. This is a beta, off until you turn it on.

- **Turn it on:** **Settings → Home base → Hearing and voice (beta)**. (Since v7.8 George's voice from
  the home base turns itself on once; see [Jarvis's voice](#jarviss-voice).)
  - **Hear me through the home base (more accurate)**, with **Fast** (Whisper base, about a second for
    a sentence) or **Accurate** (Whisper small: hears more, a little slower).
  - **George's voice from the home base**.
  - Each downloads its model on the home base the first time (about 80 and 92 MB); the card shows the
    download and then **Ready**. **Test** hears 3 seconds and shows the words, or plays one sentence.
  - Each switch is per device: turn it on on the iPhone, the Mac, or both. Turning hearing off also
    turns it off on the home base; turning George's voice off only stops it on that device (since
    v7.8: the home base keeps him for your other devices).
- **In Voice Mode** a small **via home base** mark sits next to the status while the home base is
  listening. Talk as usual; when you stop for about a second (two with **Wait after I stop talking:
  Long**), what you said goes to the home base, and the words come back into the usual 2-second check
  ("cancel", "no, I said …" and a tap on the words all work as before). The words appear when you've
  finished, not while you talk: that's how Whisper hears whole sentences.
- **Replies** are fetched from the home base sentence by sentence in George's voice, and played the
  same way as the on-device natural voice.
- **When the home base can't help**, Jarvis carries on without it:
  - It can't be reached, or takes more than 4 seconds to hear you: Jarvis says "Say that again?" and
    listens on the iPhone, as before. For the next minute the iPhone listens on its own, then Jarvis
    tries the home base again.
  - Its voice can't be reached or is too slow: the rest of the reply is said by the natural voice on
    the iPhone (when that's on) or the built-in voice.
  - The models sleep on the home base after a while unused; opening Voice Mode (and, for the voice,
    coming back to Jarvis) wakes them up.
- **What's not covered yet:** the chat's microphone, the hologram viewer's and the camera's
  microphones still use the device's own recognizer (they show your words as you talk). A home base
  that still runs an older Jarvis Core says it needs `jarvis-core update`.

## For developers

Jarvis is plain JavaScript ES modules (no framework) bundled with esbuild. The browser calls the
Claude API directly through the official `@anthropic-ai/sdk`. **[SPEC.md](SPEC.md)** is the
binding contract for every module.

```text
public/           static files copied into dist/ (index.html, manifest, service worker, icons)
src/engine/       conversation engine: lead, agent missions, streaming, prompts, holograms and blueprints (visuals.js) (no DOM)
src/platform/     settings, API key, IndexedDB history and the saved library, memory, spend, voice, Wikimedia photo search, PWA helpers; wake/ the Standby microphone (AudioWorklet), the "Hey Jarvis" worker and its client
src/lib/          safe streaming Markdown → DOM renderer; hologram and blueprint spec validators and the hologram command matcher; the screen-command matcher, "this" and placement for Screens; wake/ the clap detector, the resampler, openWakeWord's pipeline and the wake routine's words (pure)
src/ui/           app shell, chat, composer, sheets; src/ui/hud/ the HUD (Living Core, Mission Control); src/ui/presence/ the home screen, state word, Needs-you and awareness rail; src/ui/screens/ Screens (screen mode, floating panels); src/ui/hologram/ the 3D viewer (three.js, loaded on demand); src/ui/blueprint/ the blueprint viewer
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
| `[[slowbuild]]` (with `[[hologram:…]]`) | the same `show_hologram`, streamed over 12–13 seconds, so a test can speak or tap while it builds |
| `[[hologram:broken]]` / `[[hologram:huge]]` | `show_hologram` with nothing that can be shown (an error card) / far beyond every limit (capped, with warnings) |
| *(a `Blueprint request` block in `<turn_context>`)* | `draw_blueprint` once, with the best-matching sample sheet and the requested `for` ids, then a sentence |
| `[[blueprint:<sample>]]` | `draw_blueprint` with that sample (`alternator-part`, `battery-cutaway`, `battery-process`, `camry-assembly`), no `for` |
| `[[open-saved]]` | `open_saved` with the first id of the turn context's saved list (an unknown id when it is empty) |
| `[[screen:<what>:<where>]]` | (v7, new conversations) `open_screen` with that `what` (`this`, `hologram`, `answer`, `mission`, …) and `where` (`other_screen`, `beside`, `window`, `back`), then one short sentence read from the result ("It's on screen 2, sir.") |
| `[[swarm:N]] [[hologram:x]]` | a Blueprint mission: agents first, then `show_hologram`, then a synthesis with sources |
| *(Voice Mode turn: `Reply channel: spoken` in `<turn_context>`)* | every final answer is written for the ear: two or three plain sentences, a line `---`, then `## Details` with two list items (`[[long]]` puts its whole guide below the line; `[[xss]]` puts every payload there and one in the spoken part). The text streams a few words at a time, 50–90 ms apart, and a search takes about a second, so speech can start mid-reply. `[[search]]`, `[[pause]]` and `[[swarm:N]]` first say "Let me check the latest on that." Holograms and blueprints are said for the ear too: "Pulling up the AA alkaline battery now." before `show_hologram`, "Here's the AA alkaline battery. Say "expand it", or tap any part." after it; "Drawing the blueprint of the separator now.", then "The blueprint of the separator is ready; it's open on your screen." |
| `[[nobreak]]` / `[[longspoken]]` | Voice Mode turns only: a spoken reply with no `---` line or details / a spoken part of about 2,000 characters |
| *(an `Optics frame fN` line in `<turn_context>`: a Look)* | a first sentence naming the synthetic desk scene's objects, then `pin_labels` on fN with their exact pixel positions (`test/mock/fixtures/optics-scene.json`), then a closing sentence; without `pin_labels` in the tools, one plain answer |
| `[[optics:nolabels]]` / `[[optics:badframe]]` / `[[optics:offframe]]` | a Look answered in words only / `pin_labels` on a frame that doesn't exist first, then the right one / one label far outside the frame |
| `[[optics:look]]` | while the turn context says the camera is live: "Let me take a look", `look_through_camera`, then `pin_labels` on the fresh frame |
| *(after a Look in the conversation)* | "Show me a hologram of the AA battery." → `show_hologram` (battery sample; alternator or Camry when named); "Tell me more." → a longer answer; "What's this part? (the screwdriver you pinned on frame f1, at 466, 810)" → what it is, then `pin_labels` with that one label |
| *(a Jarvis Watch request)* | a structured `{ worth_saying, line, summary }`: the first frame sets the scene, later ones report a change |

**Optics and the natural voice (v7).**
- Optics: `src/ui/optics/` (the screen, the chat's Look card, the schematic, the camera on a
  screen), `src/platform/camera.js` (getUserMedia, the camera list, hot-plug, flip, the screen
  look), `src/lib/optics-tools.js` (the `pin_labels` / `look_through_camera` definitions that lead
  tools V5 freeze), `src/lib/optics.js` (frame mapping, pin layout, Watch, costs, the tools' checks),
  `src/lib/cameras.js` (camera names, picker order, the remembered camera, hot-plug decisions),
  `src/lib/optics-commands.js` (Optics words: "what am I looking at?", "flip", "hologram of this"),
  `src/engine/optics.js` and `src/engine/watch.js`. The E2E scenarios play a synthetic desk scene
  through Chromium's fake camera (`test/e2e/optics-scene.mjs`); `test/e2e/camera-rig.mjs` dresses it
  up as several cameras (a MacBook camera and a Logitech webcam, or an iPhone's Back, Back Ultra Wide
  and Front) and plugs them in and out.
- Natural voice: `src/platform/voice/voice-router.js` (the device voice or the natural one, same
  API as `tts.js`), `src/platform/voice/natural/` (the worker, its client with the WebGPU → WASM →
  built-in ladder, Web Audio output, the pinned model catalog), `src/ui/natural-voice-settings.js`.
  The E2E scenarios use a tiny stand-in model (`test/e2e/voice-standin.mjs`, accepted only with
  `localStorage['jarvis.dev.voiceStandin'] = '1'` on localhost).
- **Deploying the natural voice:** run `node scripts/fetch-voice-model.mjs` once before
  `npm run deploy`. It downloads the pinned Kokoro files from huggingface.co (q8, 92.4 MB, and
  fp32, 325.5 MB), checks their SHA-256, splits every file over 48 MiB into `.partN` files under
  `vendor/kokoro/` (q8: 2 parts, fp32: 7) so every file on GitHub Pages stays under GitHub's
  100 MiB limit and its 50 MiB warning, and adds the 13 speakers' files from kokoro-js (hash-checked).
  The build copies `vendor/kokoro/` to `dist/models/` (about 425 MB; unchanged files cost nothing
  on later deploys). `npm ci` needs the committed `.npmrc` (`onnxruntime-node-install-cuda=skip`).

Security rules worth knowing before you change anything: the Content-Security-Policy in
`index.html` is fixed by SPEC §2 (besides `api.anthropic.com`, it allows only the Wikimedia
Commons photo search and `upload.wikimedia.org` images); model, web and user text is rendered only through
`src/lib/markdown.js` (never `innerHTML`); links from model output must be `http:`, `https:` or
`mailto:` and open with `rel="noopener noreferrer"`; and the API key is never logged, put in a
URL, or exported. Shared and downloaded Markdown goes through `safeMarkdown` and
`redactSecrets` in `src/ui/share.js` (no raw HTML, no non-http(s) links, no API keys), and
backups leave out conversations that contain a key.
