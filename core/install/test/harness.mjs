// Test harness for core/install: a fake home folder, stub system commands on PATH (apt-get, sudo,
// systemctl, loginctl, gsettings, tailscale, google-chrome, node, visudo, git, dpkg-query, id), a
// local git "GitHub" holding this working tree's core/, and helpers to run install.sh and jarvis-core.
// Nothing here touches the real system: every system path the scripts write is overridden into the
// sandbox, and the stubs only log (or act on files inside the sandbox).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CORE = path.resolve(here, '../..');
export const INSTALL_SH = path.join(CORE, 'install', 'install.sh');
export const CLI = path.join(CORE, 'install', 'jarvis-core');
export const FIXTURES = path.join(CORE, 'fixtures', 'tailscale');
export const REAL_NODE = process.execPath;
const REAL_GIT = execFileSync('bash', ['-c', 'command -v git']).toString().trim();

export const USER = 'frank-wise';

/** This process's session id (field 6 of /proc/self/stat): the "terminal" the stub sudo caches for. */
export function sessionId(stat = fs.readFileSync('/proc/self/stat', 'utf8')) {
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[3];
}
export const UID = 1000;

// Ubuntu 24.04 / GNOME 46 defaults for the keys the installer changes.
export const GSETTINGS_DEFAULTS = {
  'org.gnome.desktop.session idle-delay': 'uint32 300',
  'org.gnome.desktop.screensaver lock-enabled': 'true',
  'org.gnome.desktop.screensaver ubuntu-lock-on-suspend': 'true',
  'org.gnome.settings-daemon.plugins.power idle-dim': 'true',
  'org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type': "'suspend'",
};

// Ubuntu 24.04's stock /etc/gdm3/custom.conf
export const GDM_STOCK = `# GDM configuration storage
#
# See /usr/share/gdm/gdm.schemas for a list of available options.

[daemon]
# Uncomment the line below to force the login screen to use Xorg
#WaylandEnable=false

# Enabling automatic login
#  AutomaticLoginEnable = true
#  AutomaticLogin = user1

# Enabling timed login
#  TimedLoginEnable = true
#  TimedLogin = user1
#  TimedLoginDelay = 10

[security]

[xdmcp]

[chooser]

[debug]
# Uncomment the line below to turn on debugging
# More verbose logs
# Additionally lets the X server dump core if it crashes
#Enable=true
`;

const STUBS = {
  // id: pretend to be the owner (uid 1000), whoever runs the tests
  id: `[ "\${STUB_REAL_UID:-0}" = 1 ] && exec /usr/bin/id "$@"
case "$*" in
  -u) echo ${UID} ;;
  -un|"-u -n"|"-n -u") echo ${USER} ;;
  *) exec /usr/bin/id "$@" ;;
esac`,
  // sudo: STUB_SUDO_CACHED=1 (the default) means the password is cached in the terminal the tests run
  // in (as for 15 minutes after "sudo tailscale up"). Like real sudo, that only counts in the terminal's
  // own session (STUB_TTY_SID): there the owner's "%sudo ALL" rule allows anything with -n, -l included.
  // A process in a session of its own (setsid, or the Core started by systemd) has no terminal, so only
  // a NOPASSWD rule counts there: the sandbox's sudoers file.
  sudo: `echo "sudo $*" >> "$STUB_LOG"
cached() {
  local st; read -r st < /proc/$$/stat; st=\${st##*) }
  set -- $st
  [ "\${STUB_SUDO_CACHED:-1}" = 1 ] && [ "$4" = "\${STUB_TTY_SID:-}" ]
}
if [ "$1" = -n ]; then
  shift
  case "$1" in
    true) cached; exit ;;
    -l) [ -f "$JARVIS_CORE_SUDOERS_FILE" ] || cached; exit ;;
    -v) exit 0 ;;
  esac
fi
[ "$1" = -v ] && exit 0
exec "$@"`,
  'apt-get': `echo "apt-get $*" >> "$STUB_LOG"; exit 0`,
  'dpkg-query': `pkg="\${@: -1}"
case " \${STUB_PKGS:-} " in *" $pkg "*) printf 'install ok installed' ;; *) exit 1 ;; esac`,
  visudo: `echo "visudo $*" >> "$STUB_LOG"; exit 0`,
  loginctl: `echo "loginctl $*" >> "$STUB_LOG"
f="$STUB_DIR/linger"
case "$1" in
  show-user) cat "$f" 2>/dev/null || echo no ;;
  enable-linger) echo yes > "$f" ;;
  disable-linger) echo no > "$f" ;;
esac`,
  // systemctl --user: start/restart runs the unit's ExecStart (the real Core, in fixture mode on the
  // sandbox port), stop/disable --now stops it. Any other unit (the update timer) is only flags:
  // enabled@<unit>, active@<unit>. "show jarvis-core.service -p NRestarts" reads $STUB_DIR/nrestarts.
  systemctl: `echo "systemctl $*" >> "$STUB_LOG"
[ "$1" = --user ] && shift
unit="$HOME/.config/systemd/user/jarvis-core.service"
pidf="$STUB_DIR/core.pid"
other=""
for a in "$@"; do case "$a" in jarvis-core.service) ;; *.service|*.timer) other=$a ;; esac; done
if [ -n "$other" ]; then
  q=0; now=0; for a in "$@"; do [ "$a" = --quiet ] && q=1; [ "$a" = --now ] && now=1; done
  case "$1" in
    is-enabled) if [ -f "$STUB_DIR/enabled@$other" ]; then [ $q = 1 ] || echo enabled; exit 0; else [ $q = 1 ] || echo disabled; exit 1; fi ;;
    is-active) if [ -f "$STUB_DIR/active@$other" ]; then [ $q = 1 ] || echo active; exit 0; else [ $q = 1 ] || echo inactive; exit 3; fi ;;
    enable) touch "$STUB_DIR/enabled@$other"; [ $now = 1 ] && touch "$STUB_DIR/active@$other"; exit 0 ;;
    disable) rm -f "$STUB_DIR/enabled@$other"; [ $now = 1 ] && rm -f "$STUB_DIR/active@$other"; exit 0 ;;
    start) touch "$STUB_DIR/active@$other"; exit 0 ;;
    stop) rm -f "$STUB_DIR/active@$other"; exit 0 ;;
    *) exit 0 ;;
  esac
fi
stop() { [ -f "$pidf" ] && kill "$(cat "$pidf")" 2>/dev/null; rm -f "$pidf" "$STUB_DIR/active"; sleep 0.3; }
start() {
  line=$(grep '^ExecStart=' "$unit") || exit 1
  eval "set -- \${line#ExecStart=}"
  if [ "\${STUB_CORE_LIVE:-0}" = 1 ]; then setsid "$@" >> "$STUB_DIR/core.log" 2>&1 < /dev/null &
  else JARVIS_CORE_FIXTURE=ok JARVIS_CORE_NO_PERSIST=1 setsid "$@" >> "$STUB_DIR/core.log" 2>&1 < /dev/null & fi
  echo $! > "$pidf"; touch "$STUB_DIR/active"
}
case "$1" in
  show) case "$*" in *NRestarts*) cat "$STUB_DIR/nrestarts" 2>/dev/null || echo 0 ;; esac; exit 0 ;;
  is-active) q=0; for x in "$@"; do [ "$x" = --quiet ] && q=1; done
    if [ -f "$STUB_DIR/active" ]; then [ $q = 1 ] || echo active; exit 0; else [ $q = 1 ] || echo inactive; exit 3; fi ;;
  is-enabled) [ -f "$STUB_DIR/enabled" ] && echo enabled || { echo disabled; exit 1; } ;;
  enable) touch "$STUB_DIR/enabled"; for a in "$@"; do [ "$a" = --now ] && start; done; exit 0 ;;
  disable) rm -f "$STUB_DIR/enabled"; for a in "$@"; do [ "$a" = --now ] && stop; done; exit 0 ;;
  start) start ;;
  restart) stop; start ;;
  stop) stop ;;
  show-environment) exit 0 ;;
  *) exit 0 ;;
esac`,
  journalctl: `echo "journalctl $*" >> "$STUB_LOG"; cat "$STUB_DIR/core.log" 2>/dev/null; exit 0`,
  gsettings: `echo "gsettings $*" >> "$STUB_LOG"
db="$STUB_DIR/gsettings.db"; touch "$db"
key="$2 $3"
default() { case "$1" in
  "org.gnome.desktop.session idle-delay") echo "uint32 300" ;;
  "org.gnome.desktop.screensaver lock-enabled") echo true ;;
  "org.gnome.desktop.screensaver ubuntu-lock-on-suspend") echo true ;;
  "org.gnome.settings-daemon.plugins.power idle-dim") echo true ;;
  "org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type") echo "'suspend'" ;;
  *) return 1 ;;
esac; }
case "$1" in
  get) v=$(grep -F "$key=" "$db" | tail -n 1); if [ -n "$v" ]; then echo "\${v#*=}"; else default "$key" || { echo "No such key" >&2; exit 1; }; fi ;;
  set) default "$key" >/dev/null || exit 1; grep -vF "$key=" "$db" > "$db.new"; echo "$key=$4" >> "$db.new"; mv "$db.new" "$db" ;;
  reset) grep -vF "$key=" "$db" > "$db.new"; mv "$db.new" "$db" ;;
esac`,
  'google-chrome-stable': `echo "google-chrome-stable $*" >> "$STUB_LOG"
[ "$1" = --version ] && { echo "Google Chrome 142.0.7444.175"; exit 0; }
exit 0`,
  git: `echo "git $*" >> "$STUB_LOG"; exec ${REAL_GIT} "$@"`,
  // npm: "npm ci" makes node_modules in the folder it runs in (a marker, nothing importable) unless
  // STUB_NPM_FAIL=1 (no internet); never touches the network.
  npm: `echo "npm $* (in $PWD)" >> "$STUB_LOG"
if [ "$1" = ci ]; then
  if [ "\${STUB_NPM_FAIL:-0}" = 1 ]; then echo "npm error code EAI_AGAIN" >&2; echo "npm error request to https://registry.npmjs.org/web-push failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org" >&2; exit 1; fi
  [ -f package-lock.json ] || { echo "npm error The npm ci command can only install with an existing package-lock.json" >&2; exit 1; }
  mkdir -p node_modules && echo stub > node_modules/.stub-npm-ci
fi
exit 0`,
};

// tailscale: STUB_TS = not-running | NeedsLogin | Stopped | Running; STUB_TS_CERTS=0 for a tailnet
// without HTTPS certificates; STUB_TS_ENABLES=1: the owner clicks Enable while serve waits.
function tailscaleStub() {
  return `echo "tailscale $*" >> "$STUB_LOG"
fx="${FIXTURES}"
serving="$STUB_DIR/ts-serving"
case "$1" in
  status)
    case "\${STUB_TS:-Running}" in
      not-running) cat "$fx/daemon-not-running.txt" >&2; exit 1 ;;
      NeedsLogin) cat "$fx/status-needslogin.json" ;;
      Stopped) cat "$fx/status-stopped.json" ;;
      Running)
        if [ "\${STUB_TS_CERTS:-1}" = 1 ] || [ -f "$STUB_DIR/ts-certs" ]; then cat "$fx/status-running.json"
        else ${REAL_NODE} -e 'const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); delete j.CertDomains; j.Self.Capabilities = []; delete j.Self.CapMap; process.stdout.write(JSON.stringify(j, null, 2));' "$fx/status-running.json"; fi ;;
    esac ;;
  serve)
    shift
    case "$*" in
      "status --json") if [ -f "$serving" ]; then printf '{"Web":{"alienware.tail4e5f6a.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:%s"}}}}}\n' "$(cat "$serving")"; else echo "{}"; fi ;;
      "--bg "*)
        if [ "\${STUB_TS_CERTS:-1}" != 1 ] && [ ! -f "$STUB_DIR/ts-certs" ]; then
          printf '\\nServe is not enabled on your tailnet.\\nTo enable, visit:\\n\\n         https://login.tailscale.com/f/serve?node=nAbC123\\n\\n'
          [ "\${STUB_TS_ENABLES:-0}" = 1 ] || exit 0
          touch "$STUB_DIR/ts-certs"; echo "Success."
        fi
        echo "$2" > "$serving"
        printf 'Available within your tailnet:\\n\\nhttps://alienware.tail4e5f6a.ts.net/\\n|-- / proxy http://127.0.0.1:'"$2"'\\n\\nServe started and running in the background.\\nTo disable the proxy, run: tailscale serve --https=443 off\\n' ;;
      "--https=443 off") rm -f "$serving" ;;
    esac ;;
esac`;
}

function nodeStub() {
  // STUB_NODE_VERSION=v18.19.1 pretends to be Ubuntu's old Node; everything else is the real Node.
  return `if [ "$1" = --version ] && [ -n "\${STUB_NODE_VERSION:-}" ]; then echo "$STUB_NODE_VERSION"; exit 0; fi
exec ${REAL_NODE} "$@"`;
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// A local stand-in for GitHub: a git repository holding this working tree's core/ (so uncommitted
// changes are tested too), served over file:// with partial-clone filters allowed, like GitHub.
export function makeRepo(root) {
  const work = path.join(root, 'upstream');
  fs.mkdirSync(path.join(work, 'core'), { recursive: true });
  for (const sub of ['server', 'install', 'fixtures', 'package.json', 'package-lock.json', 'whats-new.json', 'README.md']) {
    const src = path.join(CORE, sub);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(work, 'core', sub), { recursive: true });
  }
  fs.writeFileSync(path.join(work, 'README.md'), '# jarvis (test copy)\n');
  fs.mkdirSync(path.join(work, 'src'));
  fs.writeFileSync(path.join(work, 'src', 'app.js'), '// not part of core/\n');
  const g = (...args) => execFileSync(REAL_GIT, args, { cwd: work, stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A');
  g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'test copy');
  g('config', 'uploadpack.allowFilter', 'true');
  g('config', 'uploadpack.allowAnySHA1InWant', 'true');
  return { url: `file://${work}`, work, commit: (msg) => {
    g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-a', '-m', msg);
  } };
}

export function makeSandbox({ tsMode = 'missing', nodeVersion = null, nodeMissing = false, pkgs = [], gdm = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jcore-install-'));
  const home = path.join(root, 'home', USER);
  const stubs = path.join(root, 'stubs');
  const etc = path.join(root, 'etc');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(stubs);
  fs.mkdirSync(path.join(etc, 'gdm3'), { recursive: true });
  fs.mkdirSync(path.join(etc, 'sudoers.d'));
  fs.mkdirSync(path.join(root, 'bin'));
  fs.mkdirSync(path.join(root, 'tmp'));
  const write = (name, body) => fs.writeFileSync(path.join(stubs, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  for (const [name, body] of Object.entries(STUBS)) write(name, body);
  if (tsMode !== 'missing') write('tailscale', tailscaleStub());
  if (!nodeMissing) write('node', nodeStub());
  if (gdm) fs.writeFileSync(path.join(etc, 'gdm3', 'custom.conf'), GDM_STOCK);
  fs.writeFileSync(path.join(etc, 'os-release'), fs.readFileSync('/etc/os-release'));
  const log = path.join(root, 'stub.log');
  fs.writeFileSync(log, '');
  const env = {
    HOME: home,
    USER,
    LOGNAME: USER,
    LANG: 'C.UTF-8',
    PATH: `${stubs}:/usr/bin:/bin:/usr/sbin:/sbin`,
    TMPDIR: path.join(root, 'tmp'),
    NO_COLOR: '1',
    STUB_LOG: log,
    STUB_DIR: stubs,
    STUB_PKGS: pkgs.join(' '),
    STUB_TS: tsMode,
    STUB_TTY_SID: sessionId(),
    JARVIS_CORE_OS_RELEASE: path.join(etc, 'os-release'),
    JARVIS_CORE_GDM_CONF: path.join(etc, 'gdm3', 'custom.conf'),
    JARVIS_CORE_SUDOERS_FILE: path.join(etc, 'sudoers.d', 'jarvis-core-smartctl'),
    JARVIS_CORE_SHIM: path.join(root, 'bin', 'jarvis-core'),
    XDG_RUNTIME_DIR: path.join(root, 'run'),
  };
  if (nodeVersion) env.STUB_NODE_VERSION = nodeVersion;
  return { root, home, stubs, etc, log, env, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// Run a script. answers: lines typed at the keyboard (through JARVIS_CORE_TTY); noTty: run in a new
// session with no controlling terminal, as from a script or cron.
export function runScript(sb, script, args = [], { answers = null, noTty = false, env = {}, timeout = 90_000 } = {}) {
  const e = { ...sb.env, ...env };
  if (answers) {
    const f = path.join(sb.root, `answers-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(f, answers.map((a) => `${a}\n`).join(''));
    e.JARVIS_CORE_TTY = f;
  } else if (!noTty) {
    e.JARVIS_CORE_TTY = '/nonexistent/tty';
  }
  const cmd = noTty ? 'setsid' : 'bash';
  const argv = noTty ? ['-w', 'bash', script, ...args] : [script, ...args];
  const r = spawnSync(cmd, argv, { env: e, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], cwd: sb.home });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

export const install = (sb, args, opts) => runScript(sb, INSTALL_SH, args, opts);
export const cli = (sb, args, opts) => runScript(sb, path.join(sb.home, '.local', 'bin', 'jarvis-core'), args, opts);

export function stubLog(sb) {
  return fs.readFileSync(sb.log, 'utf8').split('\n').filter(Boolean);
}

// Every file under a folder, with its content hash, to prove a dry run changed nothing.
export function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p).toString('base64');
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

export function stopCore(sb) {
  const pidf = path.join(sb.stubs, 'core.pid');
  if (fs.existsSync(pidf)) {
    try {
      process.kill(Number(fs.readFileSync(pidf, 'utf8')), 'SIGTERM');
    } catch {}
  }
}
