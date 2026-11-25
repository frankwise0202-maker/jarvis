# Jarvis Core: your Alienware as Jarvis's home base

Jarvis Core turns the Alienware into a 24/7 system report. Its screen always shows a live, Jarvis-style
dashboard: the processor, the graphics card, memory, the hard drive, the network, your Tailscale devices
and a log of anything that happened. In the middle sits a small assistant you can type to ("How are you?",
"Anything wrong?", "GPU temp?"). It only reports on the computer; it is free, works offline and needs no
API key.

Your iPhone and your Mac can see the same report through Tailscale, your private network. Nobody else
can: it is never put on the public internet.

---

## Before you start (about 10 minutes, once)

**1. Google Chrome on the Alienware.** You have it already. (If not: google.com/chrome, Download
Chrome, pick the 64 bit .deb for Debian/Ubuntu, open the file and click Install.)

**2. The NVIDIA driver (for the graphics card readings).** Open **Terminal** (press the Windows key,
type `terminal`, press Enter) and paste:

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
  curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up
  ```

- On the **iPhone**: install **Tailscale** from the App Store and sign in with the **same** account.
- On the **Mac**: install **Tailscale** from the Mac App Store (or tailscale.com/download) and sign in
  with the **same** account.

If you skip Tailscale for now, the installer tells you exactly what to paste later.

---

## Install it: one command

Open **Terminal** on the Alienware and paste this one line, then press Enter:

```
wget -qO- https://raw.githubusercontent.com/frankwise0202-maker/jarvis/main/core/install/install.sh | bash
```

It takes a few minutes. You'll see numbered steps (1 of 12, 2 of 12 ...) with a green ✓ for each thing
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

No. Jarvis Core needs no Claude, no account and no API key: its little assistant runs on the Alienware
itself and only talks about the computer.

The dashboard has an **Open Jarvis** button (or press **Alt+J**). It opens the regular Jarvis app in a
normal Chrome window, on this computer. The first time, Jarvis asks for your API key there, once, like
on any new computer. Close that window (**Ctrl+W**) to get back to the dashboard.

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
| `jarvis-core uninstall` | Removes it all (see the end of this page) |

---

## If something's not right

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

---

## Undo everything

```
jarvis-core uninstall
```

It asks once, then: stops and removes Jarvis Core, removes the dashboard from login, puts your screen
blanking, lock and sleep settings back, turns automatic login off (if the installer turned it on),
removes the disk-check permission and the Tailscale sharing, and removes its files. Its history stays
in case you install it again; to delete that too, use `jarvis-core uninstall --purge`. Tailscale,
Chrome and Node.js stay installed.

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
| Optional settings (name, night dim hours, thresholds) | `~/.config/jarvis-core/config.json` |
| The disk-check permission (one read-only command) | `/etc/sudoers.d/jarvis-core-smartctl` |
| Automatic login (only if you said yes) | `/etc/gdm3/custom.conf` (the original is kept as `custom.conf.before-jarvis-core`) |
| Software it may add | `git`, `curl`, `lm-sensors`, `smartmontools` (Ubuntu's own), and Node.js 24 from NodeSource if Node.js 22 or newer isn't there already (Ubuntu's own is 18, too old) |

Jarvis Core listens only on this computer (`http://localhost:8788/`); Tailscale's `serve` passes it to
your own devices over HTTPS. It never uses Tailscale Funnel (the public internet) and refuses Funnel
traffic.

Developer documentation: [server/README.md](server/README.md) (the Core and its API),
[dashboard/README.md](dashboard/README.md) (the screen), and `install/` (the installer and its tests:
`npm test` in this folder runs the server, dashboard and installer tests).
