#!/usr/bin/env bash
# The installer for real, in a DISPOSABLE Ubuntu 24.04 container (run as root; never on a real machine):
# a real user "frank-wise", real sudo, apt, git (a file:// mirror of this branch), visudo, Node and the
# real Core on the real /proc; only systemd, gsettings, GDM's file and Tailscale are stand-ins (see
# harness.mjs), because a container has no user session, no GNOME and no tailnet.
#
#   bash core/install/test/realrun.sh            install, check, re-run, CLI, uninstall
#   KEEP=1 bash core/install/test/realrun.sh     leave it installed afterwards
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "run as root, in a disposable container" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
core=$(cd "$here/../.." && pwd)
repo=$(cd "$core/.." && pwd)
work=${REALRUN_DIR:-/tmp/jarvis-core-realrun}
user=frank-wise
port=8788

rm -rf "$work"
mkdir -p "$work"
echo "== user $user with password-protected sudo, credentials cached (sudo -n true works, smartctl is NOT allowed)"
if id "$user" >/dev/null 2>&1; then userdel -r "$user" 2>/dev/null || true; fi # a fresh machine every time
useradd -m -s /bin/bash "$user"
printf '%s\n' "$user ALL=(ALL) NOPASSWD: /usr/bin/true, /usr/bin/env, /usr/bin/install, /usr/sbin/visudo, /usr/bin/rm, /usr/bin/cp, /usr/bin/timeout, /usr/bin/loginctl, $work/stubs/tailscale" >/etc/sudoers.d/zz-jarvis-core-realrun
chmod 0440 /etc/sudoers.d/zz-jarvis-core-realrun
visudo -c -q

echo "== a file:// mirror of this branch, like GitHub (partial clone filters allowed)"
branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD)
git clone -q --bare --no-local --single-branch --branch "$branch" "file://$repo" "$work/mirror.git"
git -C "$work/mirror.git" config uploadpack.allowFilter true
git -C "$work/mirror.git" config uploadpack.allowAnySHA1InWant true

echo "== stand-ins for systemd --user, loginctl, gsettings and tailscale"
node --input-type=module -e "
  import { makeSandbox } from '$here/harness.mjs';
  import fs from 'node:fs';
  const sb = makeSandbox({ tsMode: 'Running' });
  fs.mkdirSync('$work/stubs', { recursive: true });
  for (const n of ['systemctl', 'loginctl', 'gsettings', 'tailscale', 'journalctl']) fs.copyFileSync(sb.stubs + '/' + n, '$work/stubs/' + n);
  fs.chmodSync('$work/stubs', 0o755);
  for (const n of fs.readdirSync('$work/stubs')) fs.chmodSync('$work/stubs/' + n, 0o755);
  fs.writeFileSync('$work/custom.conf', (await import('$here/harness.mjs')).GDM_STOCK);
  sb.cleanup();
"
# sudo clears the environment, so the Tailscale stand-in gets its settings baked in
mv "$work/stubs/tailscale" "$work/stubs/tailscale.stub"
printf '#!/bin/bash\nexport STUB_DIR=%s STUB_LOG=%s STUB_TS=Running STUB_TS_CERTS=0 STUB_TS_ENABLES=1\nexec %s "$@"\n' \
  "$work/state" "$work/state/stub.log" "$work/stubs/tailscale.stub" >"$work/stubs/tailscale"
chmod 755 "$work/stubs/tailscale"
mkdir -p "$work/state" "$work/run"
chown -R "$user:$user" "$work/state" "$work/run" "$work/mirror.git" # git refuses repositories owned by someone else
chmod 700 "$work/run"
chmod -R a+rX "$work"

as_user() {
  runuser -u "$user" -- env -i HOME="/home/$user" USER="$user" LOGNAME="$user" LANG=C.UTF-8 TERM=dumb \
    PATH="$work/stubs:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" XDG_RUNTIME_DIR="$work/run" \
    STUB_DIR="$work/state" STUB_LOG="$work/state/stub.log" STUB_CORE_LIVE=1 STUB_TS=Running STUB_TS_CERTS=0 STUB_TS_ENABLES=1 \
    JARVIS_CORE_REPO="file://$work/mirror.git" JARVIS_CORE_BRANCH="$branch" JARVIS_CORE_GDM_CONF="$work/custom.conf" \
    "$@"
}
refused() { # the command must fail
  if "$@" >/dev/null 2>&1; then
    echo "FAIL: should have been refused: $*" >&2
    exit 1
  fi
}
cleanup() {
  [ -f "$work/state/core.pid" ] && kill "$(cat "$work/state/core.pid")" 2>/dev/null || true
}
trap cleanup EXIT

echo "== install (answers: automatic login yes, disk health yes, Tailscale yes)"
printf 'y\ny\ny\n' >"$work/answers"
as_user env JARVIS_CORE_TTY="$work/answers" bash "$core/install/install.sh" 2>&1 | tee "$work/install-1.txt"

echo "== checks"
h=/home/$user
test -x "$h/.local/bin/jarvis-core"
test "$(runuser -u "$user" -- git -C "$h/jarvis-core-app" sparse-checkout list)" = core
test "$(runuser -u "$user" -- git -C "$h/jarvis-core-app" rev-parse --is-shallow-repository)" = true
test ! -e "$h/jarvis-core-app/src"
dpkg-query -W -f='${Status}\n' lm-sensors smartmontools | grep -c 'install ok installed' | grep -qx 2
visudo -c -q
runuser -u "$user" -- sudo -n -l /usr/sbin/smartctl -j -H -A -i /dev/sda
runuser -u "$user" -- sudo -n -l /usr/sbin/smartctl -j -H -A -i /dev/nvme0n1 >/dev/null
refused runuser -u "$user" -- sudo -n -l /usr/sbin/smartctl -j -H -A -i /dev/sda -s off
refused runuser -u "$user" -- sudo -n -l /usr/sbin/smartctl -j -H -A -i /dev/sda1
refused runuser -u "$user" -- sudo -n -l /usr/sbin/smartctl -j -H -A -i /dev/sda --drivedb=/etc/shadow
test -x /usr/local/bin/jarvis-core
curl --noproxy '*' -fsS "http://127.0.0.1:$port/api/ping"
echo
grep -q '^AutomaticLoginEnable=true$' "$work/custom.conf"
echo "checks passed"

echo "== jarvis-core status / url / screen --print-args (through the /usr/local/bin shortcut)"
as_user jarvis-core status 2>&1 | tee "$work/status.txt"
as_user jarvis-core screen --print-args
echo "== the shortcut refuses root"
refused /usr/local/bin/jarvis-core status

echo "== re-run (no answers needed)"
as_user bash "$core/install/install.sh" </dev/null 2>&1 | tee "$work/install-2.txt"

if [ "${KEEP:-0}" != 1 ]; then
  echo "== uninstall"
  as_user jarvis-core uninstall --yes 2>&1 | tee "$work/uninstall.txt"
  test ! -e /etc/sudoers.d/jarvis-core-smartctl
  test ! -e /usr/local/bin/jarvis-core
  test ! -e "$h/jarvis-core-app"
  grep -q '^AutomaticLoginEnable=false$' "$work/custom.conf"
  visudo -c -q
  echo "uninstall checks passed"
fi
rm -f /etc/sudoers.d/zz-jarvis-core-realrun
echo "REAL RUN OK"
