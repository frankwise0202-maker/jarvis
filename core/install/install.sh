#!/usr/bin/env bash
# Jarvis Core installer: the home base's 24/7 system report, on Ubuntu 24.04 (GNOME).
#
#   wget -qO- https://raw.githubusercontent.com/frankwise0202-maker/jarvis/main/core/install/install.sh | bash
#
# Safer, in two steps (download, read, then run):
#   wget -O jarvis-core-install.sh https://raw.githubusercontent.com/frankwise0202-maker/jarvis/main/core/install/install.sh
#   less jarvis-core-install.sh
#   bash jarvis-core-install.sh
#
# What it does (each step checks first, so running it again is safe: it updates and repairs):
#   - checks this is Ubuntu; finds Chrome, the NVIDIA driver and Tailscale
#   - asks up to three yes/no questions, from the keyboard (never from the download)
#   - installs git, curl, lm-sensors (and smartmontools for the disk check) with apt
#   - installs Node.js 24 LTS from NodeSource, unless Node.js 22 or newer is already there
#   - downloads only the core/ folder of the Jarvis repository into ~/jarvis-core-app
#   - installs the brain's libraries there (npm ci: the Claude SDK and web-push); without them the
#     Core still runs, and the brain says its SDK is missing
#   - installs the jarvis-core command (~/.local/bin/jarvis-core)
#   - optionally lets Jarvis Core read the hard drive's health (one narrow sudo rule)
#   - runs Jarvis Core 24/7 as a systemd user service, also before anyone logs in (lingering)
#   - starts the dashboard full screen in Chrome at every login (its own Chrome profile)
#   - keeps the screen on: no blanking, lock, dimming or suspend on AC power (and says how to undo it)
#   - optionally logs in automatically, so the dashboard comes back after a power cut
#   - shares it with your iPhone and Mac with `tailscale serve` (your devices only; never funnel)
#   - optionally keeps itself up to date: a timer checks GitHub every 20 minutes (jarvis-core autoupdate)
#
# Options: --dry-run (show every step, change nothing), --refresh (what `jarvis-core update` runs
# after downloading: rewrite the command, service and autostart, install the libraries, restart, reload
# the screen), --help.
# Test-only overrides: JARVIS_CORE_REPO, JARVIS_CORE_BRANCH, JARVIS_CORE_APP_DIR, JARVIS_CORE_TTY,
# JARVIS_CORE_OS_RELEASE, JARVIS_CORE_GDM_CONF, JARVIS_CORE_SUDOERS_FILE, JARVIS_CORE_SHIM,
# JARVIS_CORE_PORT, JARVIS_CORE_ALLOW_ROOT, JARVIS_CORE_START_WAIT_SEC, JARVIS_CORE_CGROUP_FILE.

set -uo pipefail

REPO="${JARVIS_CORE_REPO:-https://github.com/frankwise0202-maker/jarvis.git}"
BRANCH="${JARVIS_CORE_BRANCH:-main}"
PORT="${JARVIS_CORE_PORT:-8788}"
NODE_MIN=22   # what Jarvis Core needs
NODE_MAJOR=24 # what we install: LTS until April 2028 (Node 22 ends in April 2027)
APP_DIR="${JARVIS_CORE_APP_DIR:-$HOME/jarvis-core-app}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
SELF_BIN="$HOME/.local/bin/jarvis-core"
UNIT_NAME=jarvis-core.service
UNIT_FILE="$CONFIG_HOME/systemd/user/$UNIT_NAME"
AUTOSTART_FILE="$CONFIG_HOME/autostart/jarvis-core-screen.desktop"
PROFILE_DIR="$DATA_HOME/jarvis-core-screen"
STATE_DIR="$CONFIG_HOME/jarvis-core/install"
LOCAL_URL="http://localhost:$PORT/"
PING_URL="http://127.0.0.1:$PORT/api/ping"
OS_RELEASE="${JARVIS_CORE_OS_RELEASE:-/etc/os-release}"
GDM_CONF="${JARVIS_CORE_GDM_CONF:-/etc/gdm3/custom.conf}"
SUDOERS_FILE="${JARVIS_CORE_SUDOERS_FILE:-/etc/sudoers.d/jarvis-core-smartctl}"
SHIM="${JARVIS_CORE_SHIM:-/usr/local/bin/jarvis-core}"
TTY_DEV="${JARVIS_CORE_TTY:-/dev/tty}"
SMARTCTL=/usr/sbin/smartctl
AU_TIMER=jarvis-core-autoupdate.timer # the unit names of the owner's hand-made update timer, adopted
AU_SERVICE_FILE="$CONFIG_HOME/systemd/user/jarvis-core-autoupdate.service"
AU_TIMER_FILE="$CONFIG_HOME/systemd/user/$AU_TIMER"
AU_OLD_SCRIPT="$HOME/.local/bin/jarvis-core-autoupdate"
START_WAIT="${JARVIS_CORE_START_WAIT_SEC:-30}"
NPM_CI=(ci --omit=dev --no-audit --no-fund)
INSTALL_CMD="wget -qO- https://raw.githubusercontent.com/frankwise0202-maker/jarvis/main/core/install/install.sh | bash"

DRY_RUN=0
REFRESH=0
HAVE_TTY=0
SUDO_OK=0
STEP=0
STEPS=13
USER_NAME=$(id -un)
NODE_BIN=""
NODE_VERSION=""
TS_BIN=""
TS_JSON=""
TS_STATE=""
TS_URL=""
WANT_AUTOLOGIN=no
WANT_SMART=no
WANT_SERVE=later
WANT_AUTOUPDATE=no
MANUAL=()
TMP=""
SCRIPT_DIR="" # where this file is, when it is run from a file (empty when piped)
case "${BASH_SOURCE[0]:-}" in */*) SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd) || SCRIPT_DIR="" ;; esac

# ------------------------------------------------------------------------------------------ output

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\e[1m' G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' C=$'\e[36m' D=$'\e[2m' N=$'\e[0m'
else
  B='' G='' Y='' R='' C='' D='' N=''
fi
ok() { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
note() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
bad() { printf '  %s✗%s %s\n' "$R" "$N" "$*"; }
say() { printf '    %s\n' "$*"; }
would() { printf '    %s[dry run] would %s%s\n' "$D" "$*" "$N"; }
section() {
  STEP=$((STEP + 1))
  if [ "$REFRESH" = 1 ]; then
    printf '\n%s━━ %s%s\n' "$C$B" "$*" "$N"
  else
    printf '\n%s━━ %d of %d · %s%s\n' "$C$B" "$STEP" "$STEPS" "$*" "$N"
  fi
}
die() {
  bad "$*"
  printf '\n    Nothing else was changed. When it is fixed, run the same install command again.\n'
  exit 1
}
manual() { MANUAL+=("$*"); }

show_cmd() { # a command as you would type it
  local out="" a
  for a in "$@"; do
    case "$a" in
      *[\"\$\`\\]*) out+=" '${a//\'/\'\\\'\'}'" ;;
      *\'*) out+=" \"$a\"" ;;
      "" | *[!A-Za-z0-9_./:=@%+,-]*) out+=" '$a'" ;;
      *) out+=" $a" ;;
    esac
  done
  printf '%s' "${out# }"
}

# ------------------------------------------------------------------------------------------ doing things

have() { command -v "$1" >/dev/null 2>&1; }

run() { # something that changes this computer: printed in a dry run, never run
  if [ "$DRY_RUN" = 1 ]; then
    would "run: $(show_cmd "$@")"
    return 0
  fi
  "$@" </dev/null
}

as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi
}

run_root() {
  if [ "$DRY_RUN" = 1 ]; then
    if [ "$(id -u)" = 0 ]; then would "run: $(show_cmd "$@")"; else would "run: sudo $(show_cmd "$@")"; fi
    return 0
  fi
  [ "$SUDO_OK" = 1 ] || return 1
  as_root "$@" </dev/null
}

tmpdir() {
  [ -n "$TMP" ] || TMP=$(mktemp -d "${TMPDIR:-/tmp}/jarvis-core-install.XXXXXX") || die "Could not create a temporary folder"
}

same_content() { [ -f "$1" ] && [ "$(cat "$1" 2>/dev/null)" = "$2" ]; }

write_file() { # write_file PATH MODE CONTENT: a file in your home folder
  local path="$1" mode="$2" content="$3"
  if [ "$DRY_RUN" = 1 ]; then
    would "write $path:"
    printf '%s\n' "$content" | sed "s/^/      $D|$N /"
    return 0
  fi
  mkdir -p "$(dirname "$path")" &&
    printf '%s\n' "$content" >"$path.tmp.$$" &&
    chmod "$mode" "$path.tmp.$$" &&
    mv -f "$path.tmp.$$" "$path"
}

write_root_file() { # write_root_file PATH MODE CONTENT: a system file (needs the password)
  local path="$1" mode="$2" content="$3"
  if [ "$DRY_RUN" = 1 ]; then
    would "write $path (as administrator):"
    printf '%s\n' "$content" | sed "s/^/      $D|$N /"
    return 0
  fi
  [ "$SUDO_OK" = 1 ] || return 1
  tmpdir
  printf '%s\n' "$content" >"$TMP/file" && run_root install -m "$mode" -o root -g root "$TMP/file" "$path"
}

state_set() { # remember what this installer changed, for `jarvis-core uninstall`
  [ "$DRY_RUN" = 1 ] && return 0
  mkdir -p "$STATE_DIR" || return 1
  local file="$STATE_DIR/state" line out=""
  if [ -f "$file" ]; then
    while IFS= read -r line; do
      case "$line" in "$1="*) ;; *) out+="$line"$'\n' ;; esac
    done <"$file"
  fi
  printf '%s%s=%s\n' "$out" "$1" "$2" >"$file"
}

ensure_user_bus() { # systemctl --user and gsettings need the session bus, also from ssh
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_RUNTIME_DIR
  fi
  if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "$XDG_RUNTIME_DIR/bus" ]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
  fi
}

http_ok() { # URL: does it answer 2xx (never through a proxy)
  if have curl; then
    curl --noproxy '*' -fsS -m 2 -o /dev/null "$1" 2>/dev/null
  elif [ -n "$NODE_BIN" ]; then
    "$NODE_BIN" -e 'fetch(process.argv[1], { signal: AbortSignal.timeout(2000) })
      .then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1));' "$1" 2>/dev/null
  else
    return 1
  fi
}

wait_core() { # seconds
  local i
  for ((i = 0; i < $1; i++)); do
    http_ok "$PING_URL" && return 0
    sleep 1
  done
  return 1
}

json_get() { # json_get a.b.c < json: strings as is, arrays one item a line, objects their keys
  local node_bin
  node_bin=$(command -v node 2>/dev/null) || node_bin=""
  if [ -n "$node_bin" ]; then
    "$node_bin" -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let v; try { v = JSON.parse(s); } catch { process.exit(2); }
      for (const k of process.argv[1].split(".").filter(Boolean)) {
        if (v === null || typeof v !== "object") process.exit(1);
        v = v[k];
      }
      if (v === undefined || v === null) process.exit(1);
      if (Array.isArray(v)) v = v.join("\n"); else if (typeof v === "object") v = Object.keys(v).join("\n");
      process.stdout.write(String(v) + "\n");
    });' "$1"
  elif have python3; then
    python3 -I -c 'import json, sys
try:
    v = json.load(sys.stdin)
except Exception:
    sys.exit(2)
for k in [k for k in sys.argv[1].split(".") if k]:
    if not isinstance(v, dict):
        sys.exit(1)
    v = v.get(k)
if v is None:
    sys.exit(1)
if isinstance(v, bool):
    v = "true" if v else "false"
elif isinstance(v, list):
    v = "\n".join(str(x) for x in v)
elif isinstance(v, dict):
    v = "\n".join(v.keys())
print(v)' "$1"
  else
    return 1
  fi
}

# ------------------------------------------------------------------------------------------ questions

open_tty() {
  if (exec 3<"$TTY_DEV") 2>/dev/null; then
    exec 3<"$TTY_DEV"
    HAVE_TTY=1
  fi
}

ask() { # ask QUESTION y|n (the default): true for yes
  local q="$1" def="$2" hint ans
  if [ "$def" = y ]; then hint="[Y/n]"; else hint="[y/N]"; fi
  if [ "$HAVE_TTY" != 1 ]; then
    printf '  %s?%s %s %s %s(no terminal to answer in: %s)%s\n' "$C" "$N" "$q" "$hint" "$D" "$([ "$def" = y ] && echo yes || echo no)" "$N"
    [ "$def" = y ]
    return
  fi
  while :; do
    printf '  %s?%s %s %s ' "$C" "$N" "$q" "$hint"
    if ! IFS= read -r -u 3 ans; then
      ans=""
      printf '\n'
    elif [ ! -t 3 ]; then
      printf '%s\n' "$ans" # answers from a file (tests): show them
    fi
    ans=$(printf '%s' "$ans" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
    [ -n "$ans" ] || ans=$def
    case "$ans" in
      y | yes) return 0 ;;
      n | no) return 1 ;;
      *) say "Please type y or n, then press Enter." ;;
    esac
  done
}

# ------------------------------------------------------------------------------------------ checks

pkg_installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }

find_node() { # the first Node.js >= NODE_MIN: on PATH, then where NodeSource puts it
  local c v
  for c in "$(command -v node 2>/dev/null)" /usr/bin/node; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    v=$("$c" --version 2>/dev/null) || continue
    v=${v#v}
    case "${v%%.*}" in '' | *[!0-9]*) continue ;; esac
    if [ "${v%%.*}" -ge "$NODE_MIN" ]; then
      NODE_BIN=$c
      NODE_VERSION=$v
      return 0
    fi
  done
  return 1
}

chrome_bin() {
  local c
  for c in google-chrome-stable google-chrome chromium chromium-browser; do
    if have "$c"; then
      command -v "$c"
      return 0
    fi
  done
  return 1
}

ts_load() {
  TS_BIN=$(command -v tailscale 2>/dev/null) || TS_BIN=""
  TS_JSON=""
  if [ -n "$TS_BIN" ]; then
    TS_JSON=$(timeout 10 "$TS_BIN" status --json 2>/dev/null) || TS_JSON=""
  fi
  if [ -z "$TS_BIN" ]; then
    TS_STATE=not-installed
  elif [ -z "$TS_JSON" ]; then
    TS_STATE=not-running
  else
    TS_STATE=$(printf '%s' "$TS_JSON" | json_get BackendState 2>/dev/null) || TS_STATE=unknown
  fi
}
ts_dns_name() {
  local name
  name=$(printf '%s' "$TS_JSON" | json_get Self.DNSName 2>/dev/null) || return 1
  name=${name%.}
  [ -n "$name" ] && printf '%s\n' "$name"
}
ts_https_on() { # the tailnet can issue HTTPS certificates (needed by tailscale serve)
  [ -n "$(printf '%s' "$TS_JSON" | json_get CertDomains 2>/dev/null)" ] && return 0
  {
    printf '%s' "$TS_JSON" | json_get Self.Capabilities 2>/dev/null
    printf '%s' "$TS_JSON" | json_get Self.CapMap 2>/dev/null
  } | grep -qix 'https'
}
ts_serving() {
  [ -n "$TS_BIN" ] || return 1
  timeout 10 "$TS_BIN" serve status --json 2>/dev/null |
    grep -Eq "\"Proxy\": *\"(https?://)?(127\\.0\\.0\\.1|localhost|\\[::1\\])?:?$PORT/?\""
}

autologin_is_on() {
  [ -f "$GDM_CONF" ] || return 1
  awk -v user="$USER_NAME" '
    /^[ \t]*\[/ { insec = ($0 ~ /^[ \t]*\[daemon\][ \t]*$/); next }
    insec && /^[ \t]*AutomaticLoginEnable[ \t]*=/ { v = $0; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t]+$/, "", v); en = (tolower(v) == "true" || v == "1") }
    insec && /^[ \t]*AutomaticLogin[ \t]*=/ { v = $0; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t]+$/, "", v); who = v }
    END { exit !(en && who == user) }
  ' "$GDM_CONF"
}

gdm_autologin_on() { # print custom.conf with automatic login for USER_NAME in [daemon]
  awk -v user="$USER_NAME" '
    /^[ \t]*\[/ {
      insec = ($0 ~ /^[ \t]*\[daemon\][ \t]*$/); print
      if (insec) { print "AutomaticLoginEnable=true"; print "AutomaticLogin=" user; done = 1 }
      next
    }
    insec && /^[ \t]*AutomaticLogin(Enable)?[ \t]*=/ { next }
    { print }
    END { if (!done) { print ""; print "[daemon]"; print "AutomaticLoginEnable=true"; print "AutomaticLogin=" user } }
  ' "$GDM_CONF"
}

# May the Core read the disk's health? Ask sudo the way the Core will run it: from a session of its own
# with no terminal. sudo remembers the password for 15 minutes per terminal (after "sudo tailscale up",
# say), and the owner's own "%sudo ALL" rule then allows anything with -n, but only in that terminal.
smart_allowed() {
  if have setsid; then
    setsid -w sudo -n -l "$SMARTCTL" -j -H -A -i /dev/sda </dev/null >/dev/null 2>&1
  else
    [ -e "$SUDOERS_FILE" ]
  fi
}

# ------------------------------------------------------------------------------------------ steps

step_check() {
  section "Checking this computer"
  if [ "$(id -u)" = 0 ] && [ -z "${JARVIS_CORE_ALLOW_ROOT:-}" ]; then
    die "Please run the install command as yourself, not with sudo or as root (it asks for the password when it needs it)."
  fi
  local id="" id_like="" version_id="" pretty="" key value
  if [ -r "$OS_RELEASE" ]; then
    while IFS='=' read -r key value; do
      value=${value%\"}
      value=${value#\"}
      case "$key" in
        ID) id=$value ;;
        ID_LIKE) id_like=$value ;;
        VERSION_ID) version_id=$value ;;
        PRETTY_NAME) pretty=$value ;;
      esac
    done <"$OS_RELEASE"
  fi
  case " $id $id_like " in
    *" ubuntu "*) ;;
    *) die "This installer is for Ubuntu (this computer runs ${pretty:-something else})." ;;
  esac
  have apt-get || die "apt-get is missing, so this doesn't look like a normal Ubuntu."
  if [ "$id" = ubuntu ] && [ "$version_id" = 24.04 ]; then
    ok "$pretty"
  else
    note "${pretty:-Ubuntu}: this installer was made for Ubuntu 24.04; carrying on"
  fi
  ARCH=$(dpkg --print-architecture 2>/dev/null) || ARCH=$(uname -m)
  case "$ARCH" in
    amd64 | x86_64) ARCH=amd64 ;;
    arm64 | aarch64) ARCH=arm64 ;;
    *) die "This computer's processor type ($ARCH) isn't supported (64-bit PCs only)." ;;
  esac
  ok "Installing for $USER_NAME (home folder $HOME)"

  local session="${XDG_SESSION_TYPE:-}" desktop="${XDG_CURRENT_DESKTOP:-}"
  if [ -n "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]; then
    case "$session" in
      wayland) session=Wayland ;;
      x11) session=Xorg ;;
    esac
    desktop=${desktop##*:} # Ubuntu says "ubuntu:GNOME"
    ok "Desktop: ${desktop:-unknown}${session:+ on $session}"
  else
    note "Not running inside the desktop (ssh?): the screen parts take effect at the next login"
  fi

  local chrome
  if chrome=$(chrome_bin); then
    ok "$("$chrome" --version 2>/dev/null | head -n 1 | sed 's/[[:space:]]*$//' || echo Chrome) is installed"
  else
    note "Google Chrome isn't installed. The dashboard needs it: get it from https://www.google.com/chrome/"
    say "(Download Chrome > 64 bit .deb), then run: jarvis-core open"
    manual "Install Google Chrome (https://www.google.com/chrome/), then run: jarvis-core open"
  fi

  local gpu
  if have nvidia-smi && gpu=$(timeout 10 nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null) && [ -n "$gpu" ]; then
    ok "NVIDIA driver: ${gpu%%$'\n'*}"
  else
    note "The NVIDIA driver isn't loaded, so the GPU panel will say \"GPU driver not loaded\"."
    say "To fix that later: sudo ubuntu-drivers install, then restart the computer."
  fi

  ts_load
  case "$TS_STATE" in
    Running) ok "Tailscale is connected as $(ts_dns_name || hostname)" ;;
    not-installed) note "Tailscale isn't installed yet (the steps are at the end)" ;;
    not-running) note "Tailscale is installed, but its background service isn't running" ;;
    *) note "Tailscale is installed but not connected ($TS_STATE)" ;;
  esac

  if [ -f "$UNIT_FILE" ] || [ -d "$APP_DIR/.git" ]; then
    ok "Jarvis Core is already installed: this run updates and repairs it"
  fi
}

step_questions() {
  section "A few questions"
  if [ "$HAVE_TTY" = 1 ]; then
    say "Type y (yes) or n (no) and press Enter. Enter on its own picks the capital letter."
  else
    note "No terminal to answer in (run from a script?): taking the safe answer to each question."
  fi

  printf '\n'
  if autologin_is_on; then
    ok "Automatic login is already on for $USER_NAME"
    WANT_AUTOLOGIN=keep
  elif [ ! -f "$GDM_CONF" ]; then
    note "No GNOME login screen settings here ($GDM_CONF), so automatic login is left alone"
    WANT_AUTOLOGIN=no
  else
    say "Automatic login: after a power cut the computer starts straight into the dashboard,"
    say "but anyone who can reach the keyboard can then use this computer without your password."
    if ask "Log in automatically when the computer starts?" n; then WANT_AUTOLOGIN=yes; else WANT_AUTOLOGIN=no; fi
  fi

  printf '\n'
  if smart_allowed; then
    ok "Jarvis Core may already read the hard drive's health"
    WANT_SMART=keep
  else
    say "Disk health: Jarvis Core can read the hard drive's own health report (SMART) every 6 hours."
    say "That needs smartmontools and permission to run that one read-only check without a password."
    if ask "Check the hard drive's health?" y; then WANT_SMART=yes; else WANT_SMART=no; fi
  fi

  printf '\n'
  if [ "$TS_STATE" = Running ]; then
    if ts_serving; then
      ok "Tailscale already passes Jarvis Core to your devices"
      WANT_SERVE=keep
    else
      say "Sharing: Tailscale can pass the dashboard to your own devices (your iPhone and Mac) over"
      say "HTTPS. Nobody else can reach it; it is never put on the public internet."
      if ask "Share Jarvis Core with your iPhone and Mac through Tailscale?" y; then WANT_SERVE=yes; else WANT_SERVE=no; fi
    fi
  else
    say "Tailscale isn't connected yet, so nothing to ask about sharing: the steps are at the end."
    WANT_SERVE=later
  fi

  printf '\n'
  ensure_user_bus
  if [ -f "$AU_SERVICE_FILE" ] && grep -q 'autoupdate-tick' "$AU_SERVICE_FILE" 2>/dev/null && systemctl --user is-enabled --quiet "$AU_TIMER" 2>/dev/null; then
    ok "Jarvis Core already keeps itself up to date (every 20 minutes)"
    WANT_AUTOUPDATE=keep
  elif [ -f "$AU_TIMER_FILE" ] || [ -f "$AU_SERVICE_FILE" ] || [ -f "$AU_OLD_SCRIPT" ]; then
    ok "Found the update timer you set up by hand: Jarvis Core takes it over (same names)"
    WANT_AUTOUPDATE=adopt
  else
    say "Automatic updates: every 20 minutes Jarvis Core can look for a new version of itself on GitHub"
    say "and install it. If a new version doesn't start properly, it goes back to the one before by itself."
    if ask "Keep Jarvis Core up to date automatically?" y; then WANT_AUTOUPDATE=yes; else WANT_AUTOUPDATE=no; fi
  fi
}

setup_sudo() {
  printf '\n'
  if [ "$(id -u)" = 0 ]; then
    SUDO_OK=1
    return
  fi
  if [ "$DRY_RUN" = 1 ]; then
    say "(A real run asks for your password once here, for the steps that change system settings.)"
    return
  fi
  if ! have sudo; then
    note "sudo isn't available: the steps that need administrator rights will be listed at the end"
    return
  fi
  if sudo -n true 2>/dev/null; then
    SUDO_OK=1
    return
  fi
  if [ "$HAVE_TTY" = 1 ] && (exec </dev/tty) 2>/dev/null; then
    say "Some steps change system settings, so sudo will ask for your password (the one you log in"
    say "with). Nothing shows while you type it; that's normal. Then press Enter."
    if sudo -v; then
      SUDO_OK=1
    else
      note "No password, no problem: the steps that need it will be listed at the end"
    fi
  else
    note "No terminal to type a password in: the steps that need it will be listed at the end"
  fi
}

step_packages() {
  section "Software Jarvis Core needs"
  local pkgs=(git curl lm-sensors) missing=() p
  case "$WANT_SMART" in yes | keep) pkgs+=(smartmontools) ;; esac
  find_node || have gpg || pkgs+=(gnupg) # to read NodeSource's key
  for p in "${pkgs[@]}"; do pkg_installed "$p" || missing+=("$p"); done
  if [ ${#missing[@]} -eq 0 ]; then
    ok "Already installed: ${pkgs[*]}"
    return 0
  fi
  if [ "$DRY_RUN" != 1 ] && [ "$SUDO_OK" != 1 ]; then
    bad "Not installed (needs your password): ${missing[*]}"
    manual "sudo apt-get install -y ${missing[*]}"
    return 1
  fi
  say "Installing ${missing[*]} (if Ubuntu is busy updating itself, this waits for it)..."
  run_root env DEBIAN_FRONTEND=noninteractive apt-get -qq -o DPkg::Lock::Timeout=600 update ||
    note "apt reported a problem with one of its sources; trying anyway"
  if run_root env DEBIAN_FRONTEND=noninteractive apt-get -qq -o DPkg::Lock::Timeout=600 install -y --no-install-recommends "${missing[@]}"; then
    [ "$DRY_RUN" = 1 ] || ok "Installed ${missing[*]}"
  else
    bad "apt couldn't install ${missing[*]}"
    manual "sudo apt-get install -y ${missing[*]}"
    return 1
  fi
}

step_node() {
  section "Node.js (what Jarvis Core runs on)"
  if find_node; then
    ok "Node.js $NODE_VERSION is installed ($NODE_BIN); keeping it"
    return 0
  fi
  local old
  if old=$(node --version 2>/dev/null); then
    say "Node.js $old is too old: Jarvis Core needs $NODE_MIN or newer (Ubuntu 24.04's own is 18)."
  else
    say "Node.js isn't installed."
  fi
  say "Installing Node.js $NODE_MAJOR (long-term support until April 2028) from NodeSource, the usual"
  say "place to get current Node.js for Ubuntu..."
  NODE_BIN=/usr/bin/node
  if [ "$DRY_RUN" = 1 ]; then
    would "download https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key and save it as /etc/apt/keyrings/nodesource.gpg"
    write_root_file /etc/apt/sources.list.d/nodesource.list 0644 \
      "deb [arch=$ARCH signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main"
    write_root_file /etc/apt/preferences.d/nodejs 0644 $'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600'
    run_root env DEBIAN_FRONTEND=noninteractive apt-get -qq -o DPkg::Lock::Timeout=600 update
    run_root env DEBIAN_FRONTEND=noninteractive apt-get -qq -o DPkg::Lock::Timeout=600 install -y nodejs
    return 0
  fi
  if [ "$SUDO_OK" != 1 ]; then
    manual "Install Node.js $NODE_MAJOR: see https://github.com/nodesource/distributions (then run the install command again)"
    die "Installing Node.js needs your password."
  fi
  tmpdir
  mkdir -p "$TMP/gnupg" && chmod 700 "$TMP/gnupg"
  curl -fsSL -m 60 https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$TMP/nodesource.asc" ||
    die "Couldn't reach NodeSource (deb.nodesource.com). Check the internet connection."
  gpg --batch --yes --homedir "$TMP/gnupg" --dearmor -o "$TMP/nodesource.gpg" "$TMP/nodesource.asc" </dev/null ||
    die "The NodeSource key couldn't be read."
  if ! { run_root install -d -m 0755 /etc/apt/keyrings &&
    run_root install -m 0644 -o root -g root "$TMP/nodesource.gpg" /etc/apt/keyrings/nodesource.gpg &&
    write_root_file /etc/apt/sources.list.d/nodesource.list 0644 \
      "deb [arch=$ARCH signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" &&
    write_root_file /etc/apt/preferences.d/nodejs 0644 $'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600'; }; then
    die "Couldn't add NodeSource to apt's sources."
  fi
  run_root env DEBIAN_FRONTEND=noninteractive apt-get -qq -o DPkg::Lock::Timeout=600 update ||
    note "apt reported a problem with one of its sources; trying anyway"
  run_root env DEBIAN_FRONTEND=noninteractive apt-get -qq -o DPkg::Lock::Timeout=600 install -y nodejs ||
    die "apt couldn't install Node.js from NodeSource."
  NODE_BIN=""
  find_node || die "Node.js $NODE_MIN or newer still isn't available after installing it."
  ok "Node.js $NODE_VERSION is installed ($NODE_BIN)"
}

step_app() {
  section "Jarvis Core's files"
  if [ -d "$APP_DIR/.git" ]; then
    local changes
    changes=$(git -C "$APP_DIR" status --porcelain --untracked-files=no 2>/dev/null) || changes=""
    if [ -n "$changes" ]; then
      note "Files in $APP_DIR were changed on this computer, so I'm leaving that copy as it is."
      say "(To replace it with the latest version later: jarvis-core update --force; it keeps a backup.)"
    elif [ "$DRY_RUN" = 1 ]; then
      would "update $APP_DIR to the latest version: git pull --ff-only (never overwrites changes)"
    elif git -C "$APP_DIR" pull --ff-only --quiet </dev/null; then
      ok "$APP_DIR is up to date ($(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null))"
    else
      note "Couldn't update $APP_DIR (no internet, or the latest version doesn't follow on from it)."
      say "Keeping the current copy. To replace it with the latest version: jarvis-core update --force"
    fi
  elif [ -e "$APP_DIR" ]; then
    die "$APP_DIR already exists but isn't a Jarvis Core download. Rename or delete it, then run the install command again."
  else
    say "Downloading only the core/ folder of the Jarvis repository into $APP_DIR..."
    if run git clone --quiet --depth 1 --filter=blob:none --sparse --branch "$BRANCH" "$REPO" "$APP_DIR" &&
      run git -C "$APP_DIR" sparse-checkout set core; then
      [ "$DRY_RUN" = 1 ] || ok "Downloaded into $APP_DIR ($(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null))"
    else
      rm -rf "$APP_DIR"
      die "Couldn't download Jarvis Core from GitHub. Check the internet connection."
    fi
  fi
  if [ "$DRY_RUN" != 1 ] && [ ! -f "$APP_DIR/core/server/main.mjs" ]; then
    die "$APP_DIR/core/server/main.mjs is missing, so the download is incomplete. Delete $APP_DIR and run the install command again."
  fi
  deps_install
}

# The brain's libraries (the Claude SDK, web-push) with npm ci, into a fresh folder that is swapped in only
# when it is complete: a failed install (no internet) leaves the libraries that were there, and the running
# Core never sees half a node_modules. Without them the Core still starts; the brain reports its SDK missing.
deps_install() {
  local core="$APP_DIR/core" want have_sha npm_bin stage log
  if [ ! -f "$core/package-lock.json" ]; then
    if [ "$DRY_RUN" = 1 ]; then
      would "run in $core: npm $(show_cmd "${NPM_CI[@]}")   (the brain's libraries: the Claude SDK and web-push)"
    else
      note "No package-lock.json in $core, so there are no libraries to install"
    fi
    return 0
  fi
  want=$(sha256sum "$core/package-lock.json" 2>/dev/null) || want=""
  want=${want%% *}
  have_sha=$(cat "$core/node_modules/.jarvis-lock-sha256" 2>/dev/null) || have_sha=""
  if [ -n "$want" ] && [ "$want" = "$have_sha" ]; then
    ok "The brain's libraries are installed (the Claude SDK and web-push)"
    return 0
  fi
  if [ "$DRY_RUN" = 1 ]; then
    would "run in $core: npm $(show_cmd "${NPM_CI[@]}")   (the brain's libraries: the Claude SDK and web-push)"
    return 0
  fi
  npm_bin=$(command -v npm 2>/dev/null) || npm_bin=""
  if [ -z "$npm_bin" ]; then
    note "npm isn't installed, so the brain's libraries (Claude, notifications) can't be added; Jarvis Core runs without them"
    [ "$REFRESH" = 1 ] || manual "Install npm (it comes with Node.js from NodeSource), then run: jarvis-core update"
    return 0
  fi
  tmpdir
  log="$TMP/npm-ci.log"
  stage="$core/.npm-install"
  # A swap cut short (power cut) may have left the only copy aside: put it back before anything else.
  if [ ! -e "$core/node_modules" ] && [ -d "$core/node_modules.old" ]; then
    mv -T "$core/node_modules.old" "$core/node_modules" 2>/dev/null || true
  fi
  rm -rf "$stage" "$core/node_modules.old"
  if ! { mkdir -p "$stage" && cp "$core/package.json" "$core/package-lock.json" "$stage/"; }; then
    note "Couldn't prepare the libraries' folder; keeping what is there"
    return 0
  fi
  say "Installing the brain's libraries (npm ci: the Claude SDK and web-push, a minute or two)..."
  # ONNXRUNTIME_NODE_INSTALL_CUDA=skip: the speech engines run on the CPU; never fetch onnxruntime's CUDA build.
  if (cd "$stage" && ONNXRUNTIME_NODE_INSTALL_CUDA=skip timeout 900 "$npm_bin" "${NPM_CI[@]}" </dev/null) >"$log" 2>&1 && [ -d "$stage/node_modules" ]; then
    printf '%s\n' "$want" >"$stage/node_modules/.jarvis-lock-sha256"
    if { [ ! -e "$core/node_modules" ] || mv -T "$core/node_modules" "$core/node_modules.old"; } &&
      mv -T "$stage/node_modules" "$core/node_modules"; then
      rm -rf "$core/node_modules.old" "$stage"
      ok "Installed the brain's libraries (the Claude SDK and web-push)"
      return 0
    fi
    [ ! -e "$core/node_modules" ] && [ -d "$core/node_modules.old" ] && mv -T "$core/node_modules.old" "$core/node_modules"
    note "Couldn't put the new libraries in place; keeping the ones that were there"
  else
    note "Couldn't install the brain's libraries (npm ci failed: no internet?). Jarvis Core runs without"
    say "them; its Claude work and notifications wait for the next update. npm said:"
    tail -n 4 "$log" 2>/dev/null | sed 's/^/      /'
    [ "$REFRESH" = 1 ] || manual "Install the brain's libraries: jarvis-core update"
  fi
  rm -rf "$stage"
  return 0
}

step_cli() {
  section "The jarvis-core command"
  local src="$APP_DIR/core/install/jarvis-core"
  if [ "$DRY_RUN" = 1 ]; then
    would "copy $src to $SELF_BIN"
  elif [ -f "$SELF_BIN" ] && cmp -s "$src" "$SELF_BIN"; then
    ok "$SELF_BIN is up to date"
  else
    if ! { mkdir -p "$(dirname "$SELF_BIN")" && install -m 0755 "$src" "$SELF_BIN"; }; then
      die "Couldn't install $SELF_BIN"
    fi
    ok "Installed $SELF_BIN"
  fi
  [ "$REFRESH" = 1 ] && return 0
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) return 0 ;;
  esac
  # Ubuntu adds ~/.local/bin to PATH only if it existed when you logged in, so a small root-owned
  # shortcut makes `jarvis-core` work in every terminal right away. It only runs as you, never as root.
  local shim
  shim=$(printf '%s\n' '#!/bin/sh' \
    "# jarvis-core for $USER_NAME (installed by Jarvis Core's install.sh; jarvis-core uninstall removes it)" \
    "[ \"\$(id -u)\" = $(id -u) ] || { echo 'jarvis-core belongs to $USER_NAME: run it as $USER_NAME, without sudo.' >&2; exit 1; }" \
    "exec '$SELF_BIN' \"\$@\"")
  if same_content "$SHIM" "$shim"; then
    ok "'jarvis-core' works in every terminal ($SHIM)"
  elif write_root_file "$SHIM" 0755 "$shim"; then
    [ "$DRY_RUN" = 1 ] || ok "'jarvis-core' works in every terminal ($SHIM)"
  else
    note "Until you next log in, type the full path: $SELF_BIN"
  fi
}

step_smart() {
  section "Disk health"
  case "$WANT_SMART" in
    keep)
      ok "Jarvis Core may read the hard drive's health report"
      return 0
      ;;
    no)
      say "Skipped: the dashboard will say \"not checked\" for disk health."
      say "(Run the install command again any time to turn it on.)"
      return 0
      ;;
  esac
  local rule
  rule=$(printf '%s\n' \
    "# Jarvis Core: read-only disk health checks, exactly this command and nothing else." \
    "# Installed by Jarvis Core's install.sh; jarvis-core uninstall removes it." \
    "$USER_NAME ALL=(root) NOPASSWD: $SMARTCTL -j -H -A -i /dev/sd[a-z], $SMARTCTL -j -H -A -i /dev/nvme[0-9]n[0-9]")
  if [ "$DRY_RUN" = 1 ]; then
    write_root_file "$SUDOERS_FILE" 0440 "$rule"
    would "check it with: sudo visudo -c (and remove it again if the check fails)"
    return 0
  fi
  if [ "$SUDO_OK" != 1 ]; then
    bad "Not set up (needs your password)"
    manual "Run the install command again in a terminal to turn on the disk health check"
    return 1
  fi
  tmpdir
  printf '%s\n' "$rule" >"$TMP/smartctl.sudoers"
  if ! as_root visudo -c -q -f "$TMP/smartctl.sudoers" </dev/null; then
    bad "The permission didn't pass sudo's own check (visudo), so I left it out"
    return 1
  fi
  run_root install -m 0440 -o root -g root "$TMP/smartctl.sudoers" "$SUDOERS_FILE" || {
    bad "Couldn't add the permission"
    return 1
  }
  if ! as_root visudo -c -q </dev/null; then
    as_root rm -f "$SUDOERS_FILE"
    bad "sudo's check failed after adding the permission, so I removed it again"
    return 1
  fi
  state_set sudoers installed
  ok "Jarvis Core may read the hard drive's health report (smartctl only, read-only)"
}

unit_content() {
  printf '%s\n' \
    "# Jarvis Core: the home base's 24/7 system report. Installed by core/install/install.sh;" \
    "# jarvis-core status / restart / logs / uninstall." \
    "[Unit]" \
    "Description=Jarvis Core (24/7 system report)" \
    "Documentation=file://$APP_DIR/core/README.md" \
    "StartLimitIntervalSec=0" \
    "" \
    "[Service]" \
    "Type=simple" \
    "ExecStart=\"$NODE_BIN\" \"$APP_DIR/core/server/main.mjs\"" \
    "Restart=always" \
    "RestartSec=3" \
    "TimeoutStopSec=15" \
    "" \
    "[Install]" \
    "WantedBy=default.target"
}

step_service() {
  section "Running 24/7"
  ensure_user_bus
  local unit
  unit=$(unit_content)
  if same_content "$UNIT_FILE" "$unit"; then
    ok "The service is already set up ($UNIT_FILE)"
  else
    write_file "$UNIT_FILE" 0644 "$unit" || die "Couldn't write $UNIT_FILE"
    [ "$DRY_RUN" = 1 ] || ok "Wrote the service: $UNIT_FILE"
  fi

  if [ "$REFRESH" != 1 ]; then
    local linger
    linger=$(loginctl show-user "$USER_NAME" -p Linger --value 2>/dev/null) || linger=""
    if [ "$linger" = yes ]; then
      ok "Lingering is on: Jarvis Core runs from power-on, even before anyone logs in"
    elif [ "$DRY_RUN" = 1 ]; then
      would "run: loginctl enable-linger $USER_NAME (or with sudo if that is refused)"
    elif loginctl enable-linger "$USER_NAME" </dev/null 2>/dev/null || run_root loginctl enable-linger "$USER_NAME"; then
      state_set linger enabled-by-installer
      ok "Lingering is on: Jarvis Core runs from power-on, even before anyone logs in"
    else
      note "Couldn't turn on lingering, so Jarvis Core runs only while you're logged in"
      manual "sudo loginctl enable-linger $USER_NAME"
    fi
  fi

  run systemctl --user daemon-reload
  run systemctl --user enable --quiet "$UNIT_NAME" || note "Couldn't enable the service (systemctl --user)"
  if [ "$DRY_RUN" = 1 ]; then
    would "run: systemctl --user restart $UNIT_NAME (or start it the first time), then wait for $PING_URL"
    return 0
  fi
  if systemctl --user is-active --quiet "$UNIT_NAME"; then
    systemctl --user restart "$UNIT_NAME" </dev/null
  else
    systemctl --user start "$UNIT_NAME" </dev/null
  fi
  if wait_core "$START_WAIT"; then
    ok "Jarvis Core is running: $LOCAL_URL"
  else
    bad "Jarvis Core didn't answer within $START_WAIT seconds. Its last messages:"
    journalctl --user -u "$UNIT_NAME" -n 15 --no-pager 2>/dev/null | sed 's/^/      /'
    manual "Check Jarvis Core: jarvis-core status, then jarvis-core logs"
  fi
}

autostart_content() {
  printf '%s\n' \
    "[Desktop Entry]" \
    "Type=Application" \
    "Name=Jarvis Core screen" \
    "Comment=The 24/7 system report, full screen (jarvis-core open starts it by hand)" \
    "Exec=\"$SELF_BIN\" screen" \
    "Terminal=false" \
    "NoDisplay=true" \
    "X-GNOME-Autostart-enabled=true" \
    "X-GNOME-Autostart-Delay=2"
}

step_screen() {
  section "The screen"
  local desktop
  desktop=$(autostart_content)
  if same_content "$AUTOSTART_FILE" "$desktop"; then
    ok "The dashboard already starts at every login"
  else
    write_file "$AUTOSTART_FILE" 0644 "$desktop" || die "Couldn't write $AUTOSTART_FILE"
    [ "$DRY_RUN" = 1 ] || ok "The dashboard starts full screen at every login"
  fi
  if [ "$REFRESH" = 1 ]; then return 0; fi
  say "It opens in Chrome as a full-screen app window with its own profile ($PROFILE_DIR),"
  say "so it never mixes with your own browsing. F11 leaves full screen; \"Open Jarvis\" on it opens"
  say "the regular Jarvis app in a normal Chrome window, and closing that (Ctrl+W) brings you back."
  local cli="$APP_DIR/core/install/jarvis-core"
  [ -f "$cli" ] || cli="$SCRIPT_DIR/jarvis-core"
  if [ "$DRY_RUN" = 1 ] && [ -f "$cli" ]; then
    would "start Chrome like this: $(bash "$cli" screen --print-args | tr '\n' ' ')"
  fi
}

GSETTINGS=(
  "org.gnome.desktop.session|idle-delay|uint32 0"
  "org.gnome.desktop.screensaver|lock-enabled|false"
  "org.gnome.desktop.screensaver|ubuntu-lock-on-suspend|false"
  "org.gnome.settings-daemon.plugins.power|idle-dim|false"
  "org.gnome.settings-daemon.plugins.power|sleep-inactive-ac-type|'nothing'"
)

step_power() {
  section "Keeping the screen on"
  if ! have gsettings; then
    note "gsettings isn't available (not GNOME?), so screen blanking and sleep are left as they are"
    return 0
  fi
  ensure_user_bus
  local entry schema key want cur changed=0 failed=0 before="$STATE_DIR/gsettings-before" undo=()
  for entry in "${GSETTINGS[@]}"; do
    IFS='|' read -r schema key want <<<"$entry"
    cur=$(gsettings get "$schema" "$key" 2>/dev/null) || continue # not on this system
    undo+=("gsettings reset $schema $key")
    [ "$cur" = "$want" ] && continue
    if [ "$DRY_RUN" != 1 ]; then
      mkdir -p "$STATE_DIR"
      # Remember the original value once, so `jarvis-core uninstall` can put it back.
      if ! { [ -f "$before" ] && grep -q "^$schema	$key	" "$before"; }; then
        printf '%s\t%s\t%s\n' "$schema" "$key" "$cur" >>"$before"
      fi
    fi
    if run gsettings set "$schema" "$key" "$want"; then
      changed=$((changed + 1))
      [ "$DRY_RUN" = 1 ] && say "($schema $key is $cur now)"
    else
      failed=$((failed + 1))
    fi
  done
  if [ "$failed" -gt 0 ]; then
    note "$failed setting(s) couldn't be changed from here (not inside the desktop?)"
    manual "Run the install command again from a terminal on the computer's own screen, to keep the screen on"
  elif [ "$changed" -eq 0 ]; then
    ok "Already set: the screen never blanks, locks, dims, or sleeps on AC power"
  elif [ "$DRY_RUN" != 1 ]; then
    ok "The screen now never blanks, locks, dims, or sleeps on AC power"
  fi
  if [ ${#undo[@]} -gt 0 ]; then
    say "To undo just this: jarvis-core uninstall puts your old settings back, or run:"
    printf '      %s\n' "${undo[@]}"
  fi
}

step_autologin() {
  section "Automatic login"
  case "$WANT_AUTOLOGIN" in
    keep)
      ok "Automatic login is on: after a power cut the dashboard comes back by itself"
      return 0
      ;;
    no)
      say "Left as it is: after a restart, log in once and the dashboard starts by itself."
      return 0
      ;;
  esac
  local conf
  conf=$(gdm_autologin_on) || {
    bad "Couldn't read $GDM_CONF"
    return 1
  }
  if [ "$DRY_RUN" != 1 ] && [ "$SUDO_OK" != 1 ]; then
    bad "Not turned on (needs your password)"
    manual "Turn on automatic login: Settings > System > Users > Automatic Login"
    return 1
  fi
  if [ "$DRY_RUN" = 1 ]; then
    would "keep a copy of $GDM_CONF as $GDM_CONF.before-jarvis-core"
    would "set AutomaticLoginEnable=true and AutomaticLogin=$USER_NAME in the [daemon] section of $GDM_CONF"
    return 0
  fi
  as_root cp -n "$GDM_CONF" "$GDM_CONF.before-jarvis-core" </dev/null 2>/dev/null || true
  if write_root_file "$GDM_CONF" 0644 "$conf"; then
    state_set autologin enabled-by-installer
    ok "Automatic login is on from the next restart"
    say "To turn it off: Settings > System > Users > Automatic Login (or jarvis-core uninstall)."
  else
    bad "Couldn't change $GDM_CONF"
    manual "Turn on automatic login: Settings > System > Users > Automatic Login"
  fi
}

ts_commands() {
  say "  wget -qO- https://tailscale.com/install.sh | sh"
  say "  sudo tailscale up"
  say "  sudo tailscale serve --bg $PORT"
}

step_tailscale() {
  section "Your iPhone and Mac (Tailscale)"
  local name rc
  case "$TS_STATE" in
    Running) ;;
    not-installed)
      note "Tailscale isn't installed on this computer yet. Run these three commands (the second one"
      say "shows a sign-in link: use the same account as on your iPhone and Mac):"
      ts_commands
      say "Then run: jarvis-core url   (it shows the address for Jarvis)"
      manual "Set up Tailscale: wget -qO- https://tailscale.com/install.sh | sh; sudo tailscale up; sudo tailscale serve --bg $PORT"
      return 0
      ;;
    not-running)
      note "Tailscale is installed, but its background service isn't running. Run:"
      say "  sudo systemctl enable --now tailscaled"
      say "  sudo tailscale up"
      say "  sudo tailscale serve --bg $PORT"
      manual "Start Tailscale: sudo systemctl enable --now tailscaled; sudo tailscale up; sudo tailscale serve --bg $PORT"
      return 0
      ;;
    *)
      note "Tailscale is installed but not connected ($TS_STATE). Run these (the first shows a sign-in"
      say "link: use the same account as on your iPhone and Mac):"
      say "  sudo tailscale up"
      say "  sudo tailscale serve --bg $PORT"
      say "Then run: jarvis-core url"
      manual "Connect Tailscale: sudo tailscale up; sudo tailscale serve --bg $PORT"
      return 0
      ;;
  esac
  if ! name=$(ts_dns_name); then
    note "Tailscale has no name for this computer (MagicDNS is off). Turn on MagicDNS in the Tailscale"
    say "admin console (login.tailscale.com > DNS), then run the install command again."
    manual "Turn on MagicDNS (login.tailscale.com > DNS), then run the install command again"
    return 0
  fi
  case "$WANT_SERVE" in
    keep)
      TS_URL="https://$name/"
      ok "Shared with your devices only: $TS_URL"
      return 0
      ;;
    no)
      say "Not shared (you said no). To share it later: sudo tailscale serve --bg $PORT"
      return 0
      ;;
  esac
  if [ "$DRY_RUN" = 1 ]; then
    ts_https_on || would "show Tailscale's link to turn on HTTPS certificates, and wait up to 10 minutes for you to click Enable"
    would "run: sudo tailscale serve --bg $PORT   (HTTPS on your tailnet only; never funnel)"
    TS_URL="https://$name/"
    say "The address will be: $TS_URL"
    return 0
  fi
  if [ "$SUDO_OK" != 1 ]; then
    bad "Not shared yet (needs your password)"
    manual "sudo tailscale serve --bg $PORT"
    return 0
  fi
  if ! ts_https_on; then
    say "Your tailnet's HTTPS certificates are turned off, and sharing needs them. Tailscale will now"
    say "print a link: open it (hold Ctrl and click it), sign in if asked, and click Enable."
    say "This step carries on by itself once that's done (it waits up to 10 minutes;"
    say "Ctrl+C stops waiting, and the rest of the install carries on)."
  fi
  say "Running: sudo tailscale serve --bg $PORT"
  trap 'printf "\n"' INT # Ctrl+C ends only this wait, not the installer
  as_root timeout --foreground 600 "$TS_BIN" serve --bg "$PORT" </dev/null 2>&1 | sed 's/^/      /'
  rc=${PIPESTATUS[0]}
  trap - INT
  if ts_serving; then
    TS_URL="https://$name/"
    state_set serve enabled-by-installer
    ok "Shared with your devices only, over HTTPS: $TS_URL"
  else
    if [ "$rc" = 124 ]; then
      note "Tailscale was still waiting for HTTPS certificates to be turned on, so it isn't shared yet."
    else
      note "Tailscale didn't set up sharing (HTTPS certificates still off?)."
    fi
    say "Once you've clicked Enable on Tailscale's page, run: sudo tailscale serve --bg $PORT"
    say "(or run the install command again). Then: jarvis-core url"
    manual "Turn on HTTPS in Tailscale (the link above), then: sudo tailscale serve --bg $PORT"
  fi
}

# The update timer itself is written by the jarvis-core command (one place for its units): turned on
# here when the owner said yes, or taken over when a hand-made timer with the same names is there.
step_autoupdate() {
  section "Automatic updates"
  local cli="$APP_DIR/core/install/jarvis-core" line rc
  [ -f "$cli" ] || cli="$SCRIPT_DIR/jarvis-core"
  case "$WANT_AUTOUPDATE" in
    no)
      say "Off (you said no). To turn it on later: jarvis-core autoupdate on"
      return 0
      ;;
    keep)
      [ "$DRY_RUN" = 1 ] || "$SELF_BIN" autoupdate refresh </dev/null >/dev/null 2>&1
      ok "On: every 20 minutes Jarvis Core looks for a new version on GitHub and installs it by itself"
      return 0
      ;;
  esac
  if [ "$DRY_RUN" = 1 ]; then
    if [ -f "$cli" ]; then
      while IFS= read -r line; do
        case "$line" in
          "# /"*) would "write ${line#\# }:" ;;
          *) printf '      %s|%s %s\n' "$D" "$N" "$line" ;;
        esac
      done < <(bash "$cli" autoupdate print-units 2>/dev/null)
    else
      would "write $AU_SERVICE_FILE and $AU_TIMER_FILE (they run jarvis-core autoupdate-tick every 20 minutes)"
    fi
    [ -f "$AU_OLD_SCRIPT" ] && would "remove $AU_OLD_SCRIPT (the hand-made update script; the timer no longer needs it)"
    would "run: systemctl --user daemon-reload"
    would "run: systemctl --user enable --now $AU_TIMER"
    say "Each check updates only when GitHub's core/ folder changed. If the new version doesn't answer 90"
    say "seconds after an update, it goes back to the previous one by itself and logs it."
    return 0
  fi
  "$SELF_BIN" autoupdate on </dev/null 2>&1 | sed -n '/^  /p'
  rc=${PIPESTATUS[0]}
  if [ "$rc" != 0 ]; then
    note "Automatic updates couldn't be turned on here; run this later: jarvis-core autoupdate on"
    manual "Turn on automatic updates: jarvis-core autoupdate on"
  fi
}

done_box() {
  local lines=() width=0 line top
  lines+=("Done. Here's what to do next" "")
  if [ -n "$TS_URL" ]; then
    lines+=("1. On your iPhone and on your Mac, open Jarvis, go to"
      "   Settings > Home base and paste this address:"
      ""
      "       $TS_URL"
      ""
      "   Tailscale must be on there too, signed in to the same account."
      "   If Chrome asks to allow devices on your local network: Allow.")
  elif [ "$TS_STATE" = Running ]; then
    lines+=("1. Finish sharing through Tailscale (see above), then run"
      "       jarvis-core url"
      "   and paste the address it shows into Jarvis on your iPhone"
      "   and your Mac: Settings > Home base.")
  else
    lines+=("1. Set up Tailscale (the steps are above), then run"
      "       jarvis-core url"
      "   and paste the address it shows into Jarvis on your iPhone"
      "   and your Mac: Settings > Home base.")
  fi
  lines+=(""
    "2. The dashboard starts by itself every time you log in."
    "   To start it now:  jarvis-core open   (F11 leaves full screen)"
    ""
    "3. Check on it any time:  jarvis-core status"
    "   Get the latest version:  jarvis-core update"
    "   Undo everything:  jarvis-core uninstall")
  case "$WANT_AUTOUPDATE" in
    yes | keep | adopt) lines+=("" "It keeps itself up to date (jarvis-core autoupdate status).") ;;
  esac
  case "$WANT_AUTOLOGIN" in
    yes | keep) lines+=("" "Automatic login is on: after a power cut it comes back by itself.") ;;
    *) lines+=("" "After a restart, log in once and the dashboard comes back.") ;;
  esac
  for line in "${lines[@]}"; do [ ${#line} -gt "$width" ] && width=${#line}; done
  width=$((width + 2))
  top=$(printf '%*s' "$width" '' | sed 's/ /━/g')
  printf '\n%s┏%s┓%s\n' "$G" "$top" "$N"
  for line in "${lines[@]}"; do
    if [ "$line" = "Done. Here's what to do next" ]; then
      printf '%s┃%s %s%-*s%s %s┃%s\n' "$G" "$N" "$B" "$((width - 2))" "$line" "$N" "$G" "$N"
    else
      printf '%s┃%s %-*s %s┃%s\n' "$G" "$N" "$((width - 2))" "$line" "$G" "$N"
    fi
  done
  printf '%s┗%s┛%s\n' "$G" "$top" "$N"
}

finish() {
  if [ ${#MANUAL[@]} -gt 0 ]; then
    printf '\n%sStill to do by hand:%s\n' "$B" "$N"
    local m
    for m in "${MANUAL[@]}"; do printf '  - %s\n' "$m"; done
  fi
  done_box
  if [ "$DRY_RUN" = 1 ]; then
    printf '\n%sThat was a dry run: nothing was changed.%s Run it without --dry-run to install.\n' "$B" "$N"
    return 0
  fi
  if [ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ] || ! chrome_bin >/dev/null; then
    return 0
  fi
  printf '\n'
  if ask "Start the dashboard on this screen now?" y; then
    "$SELF_BIN" open
  fi
}

# ------------------------------------------------------------------------------------------ main

usage() {
  cat <<EOF
Jarvis Core installer for Ubuntu 24.04.

  $INSTALL_CMD

  bash install.sh             install, or update and repair (safe to run again)
  bash install.sh --dry-run   show every step, change nothing
  bash install.sh --refresh   what 'jarvis-core update' runs after downloading
EOF
}

refresh() {
  printf '%sRefreshing Jarvis Core%s\n' "$B" "$N"
  [ "$(id -u)" != 0 ] || [ -n "${JARVIS_CORE_ALLOW_ROOT:-}" ] || die "Run it as yourself, not as root."
  find_node || die "Node.js $NODE_MIN or newer is missing. Run the install command again."
  step_cli
  section "The brain's libraries"
  deps_install
  step_service
  step_screen
  if [ "$DRY_RUN" != 1 ] && { [ -f "$AU_TIMER_FILE" ] || [ -f "$AU_SERVICE_FILE" ] || [ -f "$AU_OLD_SCRIPT" ]; }; then
    section "Automatic updates"
    "$SELF_BIN" autoupdate refresh </dev/null 2>&1 | sed -n '/^  /p'
  fi
  if [ "$DRY_RUN" != 1 ] && pgrep -u "$(id -u)" -f -- "--user-data-dir=$PROFILE_DIR( |$)" >/dev/null 2>&1; then
    if in_service; then
      # Run by the update timer: a Chrome started from here would be stopped with the timer's job.
      say "The dashboard on the screen reloads itself when it sees the new version."
    else
      "$SELF_BIN" open
    fi
  elif [ "$DRY_RUN" != 1 ] && in_service && [ -f "$AUTOSTART_FILE" ] && have systemd-run && screen_env_ready; then
    # No dashboard on the screen while the desktop is up: an earlier update could have stopped it along with
    # its own job. Start it again as a user unit of its own, so it outlives this job (jarvis-core screen
    # waits for the Core, then becomes Chrome, so the unit lasts as long as the dashboard is open).
    if systemd-run --user --collect --quiet --unit="jarvis-core-screen-$(date +%s)" --description="Jarvis Core screen" "$SELF_BIN" screen </dev/null >/dev/null 2>&1; then
      ok "Put the dashboard back on the screen"
    else
      note "Couldn't put the dashboard back on the screen; log out and back in, or run: jarvis-core open"
    fi
  fi
  printf '\n%sJarvis Core is up to date.%s\n' "$B" "$N"
}

screen_env_ready() { # the desktop session's display is known to the user manager (GNOME exports it at login)
  systemctl --user show-environment 2>/dev/null | grep -qE '^(WAYLAND_DISPLAY|DISPLAY)='
}

in_service() { # run by a systemd service (an update timer): whatever it starts is stopped with it
  [ -n "${JARVIS_CORE_UNATTENDED:-}" ] && return 0
  local cg
  cg=$(tail -n 1 "${JARVIS_CORE_CGROUP_FILE:-/proc/self/cgroup}" 2>/dev/null) || return 1
  case "${cg##*/}" in *.service) return 0 ;; esac
  return 1
}

main() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --dry-run | -n) DRY_RUN=1 ;;
      --refresh) REFRESH=1 ;;
      --help | -h)
        usage
        return 0
        ;;
      *)
        usage
        return 2
        ;;
    esac
  done
  trap '[ -n "$TMP" ] && rm -rf "$TMP"' EXIT
  if [ "$REFRESH" = 1 ]; then
    refresh
    return
  fi

  printf '\n%sJarvis Core installer%s: the 24/7 system report for this computer.\n' "$B" "$N"
  if [ "$DRY_RUN" = 1 ]; then
    printf '%sDry run: every step is shown, nothing is changed.%s\n' "$Y" "$N"
  fi
  printf 'It takes a few minutes. Running it again later is safe: it updates and repairs.\n'

  open_tty
  step_check
  step_questions
  setup_sudo
  step_packages
  step_node
  step_app
  step_cli
  step_smart
  step_service
  step_screen
  step_power
  step_autologin
  step_tailscale
  step_autoupdate
  finish
}

# Everything above is only definitions, so a download cut short runs nothing; and the whole line
# below is read before it runs, so nothing after it is taken from the pipe.
main "$@"; exit $?
