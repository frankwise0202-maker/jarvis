# Jarvis Core: your Alienware as Jarvis's home base

Jarvis Core turns the Alienware into a 24/7 system report. Its screen always shows a live, Jarvis-style
dashboard: the processor, the graphics card, memory, the hard drive, the network, your Tailscale devices
and a log of anything that happened. In the middle sits a small assistant you can type to ("How are you?",
"Anything wrong?", "GPU temp?"). It only reports on the computer; it is free, works offline and needs no
API key.

Your iPhone and your Mac can see the same report through Tailscale, your private network. Nobody else
can: it is never put on the public internet.

From version 1.1 it is also Jarvis's **brain at home**: it can research a question for you, keep watch
for something, have a morning briefing ready at 7:00 and send a notification to your iPhone, all while
your phone is locked (see "The brain" below).

---

## Before you start (about 10 minutes, once)

**1. Google Chrome on the Alienware.** You have it already. (If not: google.com/chrome, Download
Chrome, pick the 64 bit .deb for Debian/Ubuntu, open the file and click Install.)

**2. The NVIDIA driver (for the graphics card readings).** Open **Terminal** (press the Windows key,
type `terminal`, press Enter) and paste:

> **To paste in Terminal:** right-click and choose **Paste**, or press **Ctrl+Shift+V**
> (Ctrl+V on its own doesn't work there).

```
nvidia-smi
```

- If you see a table with "GeForce GTX 970" in it: all good.
- If it says `command not found` (or "couldn't communicate with the NVIDIA driver"), paste this, type
  your password when asked (nothing shows while you type; that's normal), wait until it finishes, then
  restart the computer:

  ```
  sudo ubuntu-drivers install
  ```

  You can also do this later. Until then the graphics card panel says "GPU driver not loaded" and
  everything else works.

**3. Tailscale on all three devices, with the same account.**

- On the **Alienware**, in Terminal, paste these two lines, one at a time. The second one prints a
  link: hold **Ctrl** and click it, sign in, and come back.

  ```
  wget -qO- https://tailscale.com/install.sh | sh
  sudo tailscale up
  ```

- On the **iPhone**: install **Tailscale** from the App Store and sign in with the **same** account.
- On the **Mac**: install **Tailscale** from the Mac App Store (or tailscale.com/download) and sign in
  with the **same** account.

If you skip Tailscale for now, the installer tells you exactly what to paste later.

---

## Install it: one command

Open **Terminal** on the Alienware and paste this one line (right-click > **Paste**, or **Ctrl+Shift+V**),
then press Enter:

```
wget -qO- https://raw.githubusercontent.com/frankwise0202-maker/jarvis/main/core/install/install.sh | bash
```

It takes a few minutes. You'll see numbered steps (1 of 13, 2 of 13 ...) with a green ✓ for each thing
that's done and a yellow ! for anything that needs you.

### What it asks you (type `y` or `n`, then Enter)

1. **"Log in automatically when the computer starts?"** Yes means that after a power cut the
   dashboard comes back by itself. The trade-off: anyone who can reach the keyboard can use the
   computer without your password. If you say no, just log in once after a restart and the dashboard
   comes back.
2. **"Check the hard drive's health?"** Yes is recommended. Jarvis Core then reads the drive's own
   health report every 6 hours (it is allowed to run that one read-only check, nothing else). With no,
   the screen says "not checked".
3. **"Share Jarvis Core with your iPhone and Mac through Tailscale?"** (only if Tailscale is
   connected). Yes is what you want. If Tailscale says HTTPS certificates are off, it prints a link:
   hold Ctrl, click it, click **Enable**, and the installer carries on by itself.
4. **"Keep Jarvis Core up to date automatically?"** Yes is recommended. Every 20 minutes it looks for a
   new version on GitHub and installs it by itself; if a new version doesn't start properly, it goes
   back to the previous one by itself. (If you already set up an update timer by hand, it takes that
   over without asking.)

It also asks for your password once (the one you log in with), for the steps that change system
settings. Nothing shows while you type it; that's normal.

### What you'll see at the end

A green box, **"Done. Here's what to do next"**, with the address for your iPhone and Mac, something
like:

```
https://alienware.tail1234ab.ts.net/
```

Then it offers to start the dashboard. It fills the screen; press **F11** if you want to leave full
screen (F11 again goes back). From now on it starts by itself every time you log in.

You can run the same command again any time: it checks everything, updates and repairs, and never
asks again about what's already set up.

**Prefer to read it before running it?** Download, read, then run:

```
wget -O jarvis-core-install.sh https://raw.githubusercontent.com/frankwise0202-maker/jarvis/main/core/install/install.sh
less jarvis-core-install.sh
bash jarvis-core-install.sh
```

(`less` shows the file: arrow keys to scroll, `q` to quit. If you have `curl`, `curl -fsSL <the same
address> | bash` works too. To see every step without changing anything, add `--dry-run`:
`bash jarvis-core-install.sh --dry-run`.)

---

## Link Jarvis on your iPhone and your Mac

1. Make sure Tailscale is on (connected) on the device.
2. Open Jarvis, go to **Settings → Home base**, and paste the address from the green box.
   (This setting arrives with the Jarvis app update v7.5. Until then you can open the address
   directly in Safari or Chrome to see the dashboard.)
3. If Chrome asks to **allow access to devices on your local network**, choose **Allow**.

Lost the address? On the Alienware, in Terminal: `jarvis-core url`

---

## "Do I need to download Claude on it?"

No. The system report and its little assistant need no Claude, no account and no API key: they run on
the Alienware itself and only talk about the computer. The brain's research, watching and the full
morning briefing do use your Claude API key, and you give it to the home base from your iPhone (see
"Give the home base your key" below), never by typing it on the Alienware. Everything it needs is
installed for you.

The dashboard has an **Open Jarvis** button (or press **Alt+J**). It opens the regular Jarvis app in a
normal Chrome window, on this computer. The first time, Jarvis asks for your API key there, once, like
on any new computer. Close that window (**Ctrl+W**) to get back to the dashboard.

---

## The brain: Jarvis keeps working while your phone is locked

Ask Jarvis on your iPhone to "research the best 27-inch monitor in the background", or "tell me when
the LG 27GP850 drops under $300", and the home base does it while the phone is in your pocket or
locked. When something is ready, your iPhone gets a notification; tap it to open the result. Everything
below is in Jarvis on the iPhone (version 7.6 or later), **Settings → Home base**, under the address.

### Give the home base your key (once, from the iPhone)

1. Open Jarvis on the iPhone, go to **Settings → Home base**.
2. Tap **Give the home base your key**. Jarvis sends the key this iPhone already has, once.
3. You then see only its last four characters (like `…Ab3D`), as a check. **Remove** takes it off the
   home base again.

The key stays on the Alienware in a locked folder that only you can read
(`~/.config/jarvis-core/secrets/`). It is never shown again, never written in a log, and only ever sent
to Claude itself (api.anthropic.com). Without a key everything else still works: the system report, the
free morning briefing, notifications and sync. You just see one "Give the home base your key" button.

### Spending limits

Work in the background costs money on your Claude account, so the home base stops itself at **$5 a
day** and **$50 a month** (change both under **Limits**). Research that would start over a limit waits
("blocked"); research that reaches the limit while it runs stops and keeps what it found so far, so the
limit is never passed. The morning briefing's Claude part never costs more than $0.30 a day. The home base sheet (tap the home
base tile) shows today's and this month's spending.

### The morning briefing

Every day at **7:00** the home base writes a short briefing: the weather for your place, a few headlines
(news and tech), how the home base did overnight, anything it finished for you overnight, what's new
in Jarvis and a music suggestion. With your key, Jarvis writes it in its own voice and picks
the top stories; without one you get the same facts in plain form. If the Alienware was off at 7:00,
the briefing comes once it is back on and online (within 3 hours); if the weather or the news could not
be fetched, it tries once more a few minutes later, without a second notification.

- **On the Alienware's screen** it fills the screen ("Good morning, Frank.") until 10:00. Move the
  mouse or press a key to see the system report; after 10 quiet minutes the briefing comes back.
- **On the iPhone** it is a card at the top of the home screen, and a notification at 7:00. "Brief me"
  in the chat (or in Voice Mode) brings it up any time.
- Change the time, °F or °C, and the place under **Morning briefing**. "Use this iPhone's location"
  sends your position once, rounded to about a kilometre (it is not followed); or type a city instead.

### Notifications

Tap **Turn on notifications** and allow them when the iPhone asks. On the iPhone this works in Jarvis
opened from its Home Screen icon (iOS 16.4 or newer), not in a Safari tab. **Test** sends one straight
away. The Mac's Chrome can have them too, the same way. If a device stops taking them (the app was
removed, say), the home base forgets that device by itself.

### Sync and backups

With **Keep this device in sync through the home base** on (it is, once a device is linked), each
device sends its Jarvis backup to the home base (the same backup as Settings → Backup, never with your
key) and picks up what your other devices have: conversations and saved items it is missing are added,
and where both have the same one, the newer copy wins. Syncing never deletes anything. The home base
keeps each device's latest backup plus one for each of the last 14 days, on the Alienware's 1 TB drive
(`~/.local/share/jarvis-core/sync/`). **Sync now** does it straight away.

### Automatic updates

If you said yes in the install, Jarvis Core looks for a new version every 20 minutes and installs it by
itself, only when its own files changed on GitHub. If a new version doesn't answer within 90 seconds,
it goes back to the one before by itself, says so in the event log, and doesn't try that version again.

| Command | What it does |
|---|---|
| `jarvis-core autoupdate status` | On or off, the last check, the last update |
| `jarvis-core autoupdate on` | Turns it on (and takes over an update timer you set up by hand) |
| `jarvis-core autoupdate off` | Turns it off; `jarvis-core update` still works by hand |

---

## Everyday commands (in Terminal)

| Command | What it does |
|---|---|
| `jarvis-core status` | Is it running? Is everything OK? Which addresses? |
| `jarvis-core url` | The address to paste into Jarvis on the iPhone and the Mac |
| `jarvis-core open` | Puts the dashboard back on the screen (restarts it if it's already open) |
| `jarvis-core update` | Gets the latest version, restarts, reloads the screen |
| `jarvis-core restart` | Restarts Jarvis Core (the screen reconnects by itself) |
| `jarvis-core logs` | Its recent messages (`jarvis-core logs -f` keeps following; Ctrl+C stops) |
| `jarvis-core autoupdate status` | Does it update itself? When did it last check? (`on` / `off` to change) |
| `jarvis-core uninstall` | Removes it all (see the end of this page) |

---

## If something's not right

**I pressed Ctrl+V and nothing appeared.** Terminal pastes with **Ctrl+Shift+V**, or right-click and
choose **Paste**.

**I pasted the install command and nothing happened at all.** The download didn't arrive (no
internet, or GitHub was busy). Check the internet connection and paste it again a minute later.

**The screen is black or shows the desktop instead of the dashboard.**
Move the mouse first. If the dashboard isn't there, open Terminal and run `jarvis-core open`. If Chrome
says the page can't be reached, run `jarvis-core restart`, then `jarvis-core open`.

**The dashboard is grey and says OFFLINE (a banner under the core).**
The dashboard can't reach Jarvis Core. It normally comes back by itself within seconds (it restarts
automatically). If it stays offline, run `jarvis-core restart`. Still offline? Run `jarvis-core logs`
and send the last lines to whoever helps you.

**It got darker at night.** That's on purpose: from 23:00 to 07:00 the screen dims and slows down to
protect the monitor. Move the mouse or press a key and it brightens for 2 minutes.

**The iPhone or Mac can't connect.**
- Is Tailscale on (connected) on that device, and signed in to the same account?
- On the Alienware, run `tailscale status`. If it says "Logged out" or "Stopped", run `sudo tailscale up`.
- Run `jarvis-core url`. If it says sharing isn't set up, it shows the one command to paste.
- If Tailscale mentions HTTPS certificates: open the link it printed, click **Enable**, then run
  `sudo tailscale serve --bg 8788`.

**"GPU driver not loaded".** The NVIDIA driver isn't installed or didn't start. Run
`sudo ubuntu-drivers install`, restart the computer, and check with `nvidia-smi`.

**Disk health says "not checked".** You answered no to the disk question. Paste the install command
again and answer yes.

**After a power cut it waits at the login screen.** Automatic login is off (your choice). Log in and
the dashboard comes back. To change your mind, paste the install command again and answer yes.

**A window (for example "Software Updater") covers the dashboard.** Deal with it or close it; the
dashboard is behind it. `jarvis-core open` brings the dashboard back to the front.

**Getting out of the full-screen dashboard.** F11 leaves full screen. The Windows key shows all
windows. Closing the dashboard (Alt+F4) is fine too: `jarvis-core open` brings it back, and it comes
back by itself at the next login.

**Research says "blocked".** The day's ($5) or the month's ($50) limit is used up. It starts again
tomorrow (or next month), or raise the limit in Jarvis: Settings → Home base → Limits.

**The home base says Claude "isn't installed".** Its libraries didn't download (no internet during an
update). Run `jarvis-core update`; `jarvis-core status` says when they are there.

**No notifications on the iPhone.** Open Jarvis from its Home Screen icon (not Safari), Settings → Home
base → Turn on notifications, then **Test**. Check the iPhone's Settings → Notifications → Jarvis is
allowed.

**An update went wrong.** If a new version doesn't start, the automatic update goes back to the
previous one by itself; `jarvis-core autoupdate status` shows it. To start over from a fresh copy:
`jarvis-core update --force` (your old copy is kept next to it).

---

## Undo everything

```
jarvis-core uninstall
```

It asks once, then: stops and removes Jarvis Core and its automatic updates, removes the dashboard from
login, puts your screen blanking, lock and sleep settings back, turns automatic login off (if the
installer turned it on), removes the disk-check permission and the Tailscale sharing, and removes its
files. Its history, your devices' backups and your settings (your Claude key too) stay in case you
install it again; to delete those as well, use `jarvis-core uninstall --purge`. Tailscale, Chrome and
Node.js stay installed.

To undo only the "screen always on" settings, paste these:

```
gsettings reset org.gnome.desktop.session idle-delay
gsettings reset org.gnome.desktop.screensaver lock-enabled
gsettings reset org.gnome.desktop.screensaver ubuntu-lock-on-suspend
gsettings reset org.gnome.settings-daemon.plugins.power idle-dim
gsettings reset org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type
```

---

## For the curious: what the installer puts where

| What | Where |
|---|---|
| The program (only the `core/` folder of the Jarvis repository, a light download) | `~/jarvis-core-app` |
| The `jarvis-core` command | `~/.local/bin/jarvis-core` (plus a small shortcut in `/usr/local/bin` so it works in every terminal at once) |
| The 24/7 service (starts at power-on, restarts itself if it stops) | `~/.config/systemd/user/jarvis-core.service`, with lingering on |
| The dashboard at login (Chrome, full screen, its own profile) | `~/.config/autostart/jarvis-core-screen.desktop`, profile in `~/.local/share/jarvis-core-screen` |
| History, events (a week, saved every 5 minutes) | `~/.local/share/jarvis-core/` |
| The brain's libraries (the Claude SDK and web-push, from npm) | `~/jarvis-core-app/core/node_modules` |
| Your Claude key (only once you give it from the iPhone) | `~/.config/jarvis-core/secrets/` (only you can read it) |
| Research, watchers, spending, briefings | `~/.local/share/jarvis-core/brain/` |
| Your devices' backups (the latest of each, plus 14 days) | `~/.local/share/jarvis-core/sync/` |
| Notification keys and the devices that get them | `~/.local/share/jarvis-core/push/` |
| Automatic updates (only if you said yes) | `~/.config/systemd/user/jarvis-core-autoupdate.timer` and `.service`; what they did: `~/.local/share/jarvis-core/autoupdate.log` |
| Optional settings (name, night dim hours, thresholds) | `~/.config/jarvis-core/config.json` |
| The disk-check permission (one read-only command) | `/etc/sudoers.d/jarvis-core-smartctl` |
| Automatic login (only if you said yes) | `/etc/gdm3/custom.conf` (the original is kept as `custom.conf.before-jarvis-core`) |
| Software it may add | `git`, `curl`, `lm-sensors`, `smartmontools` (Ubuntu's own), and Node.js 24 from NodeSource if Node.js 22 or newer isn't there already (Ubuntu's own is 18, too old) |

Jarvis Core listens only on this computer (`http://localhost:8788/`); Tailscale's `serve` passes it to
your own devices over HTTPS. It never uses Tailscale Funnel (the public internet) and refuses Funnel
traffic. What it fetches from the internet: Claude (only with your key), the weather (Open-Meteo),
news headlines (public RSS feeds), the push services of Apple and Google for your notifications, and
GitHub for updates.

Developer documentation: [server/README.md](server/README.md) (the Core and its API),
[dashboard/README.md](dashboard/README.md) (the screen), and `install/` (the installer and its tests:
`npm test` in this folder runs the server, dashboard and installer tests).
