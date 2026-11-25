// node --test: core/install/install.sh and the jarvis-core command, with stub system commands.
// Dry runs on a fresh machine, with old Node, with Tailscale missing / logged out / stopped / not
// running / running (certificates on and off) and with no terminal; then a full install into a
// sandbox (the real Core started from the service's ExecStart), a re-run, the CLI and uninstall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import {
  makeSandbox, makeRepo, install, cli, runScript, stubLog, snapshot, freePort, stopCore, CLI,
  GSETTINGS_DEFAULTS, GDM_STOCK, USER, CORE,
} from './harness.mjs';

const RULE = `${USER} ALL=(root) NOPASSWD: /usr/sbin/smartctl -j -H -A -i /dev/sd[a-z], /usr/sbin/smartctl -j -H -A -i /dev/nvme[0-9]n[0-9]`;
const URL = 'https://alienware.tail4e5f6a.ts.net/';

// In a dry run, these must never be called: anything that changes the system.
const MUTATING = [
  /^sudo (?!-n -l )/, /^apt-get /, /^systemctl --user (enable|start|restart|daemon-reload|disable|stop)/,
  /^loginctl (enable|disable)-linger/, /^gsettings (set|reset)/, /^tailscale serve --/, /^tailscale (up|funnel)/,
  /^git (clone|pull|fetch|sparse-checkout|reset|checkout|stash)/, /^visudo/, /^google-chrome-stable (?!--version)/,
];
function assertNoChanges(sb, before) {
  const bad = stubLog(sb).filter((l) => MUTATING.some((re) => re.test(l)));
  assert.deepEqual(bad, [], 'a dry run called something that changes the system');
  assert.deepEqual(snapshot(sb.home), before.home, 'a dry run changed the home folder');
  assert.deepEqual(snapshot(sb.etc), before.etc, 'a dry run changed system files');
}
const snap = (sb) => ({ home: snapshot(sb.home), etc: snapshot(sb.etc) });

test('dry run on a fresh machine: every step shown, nothing changed', () => {
  const sb = makeSandbox({ tsMode: 'missing', nodeMissing: true });
  try {
    const before = snap(sb);
    const r = install(sb, ['--dry-run'], { answers: ['y', 'y'] });
    assert.equal(r.code, 0, r.out);
    const o = r.out;
    assert.match(o, /Dry run: every step is shown, nothing is changed/);
    assert.match(o, /1 of 13 · Checking this computer/);
    assert.match(o, /✓ Ubuntu 24\.04/);
    assert.match(o, /Google Chrome 142\.0\.7444\.175 is installed/);
    assert.match(o, /GPU driver not loaded".*\n.*sudo ubuntu-drivers install/);
    assert.match(o, /Tailscale isn't installed yet/);
    // the questions, answered from the keyboard
    assert.match(o, /Log in automatically when the computer starts\? \[y\/N\] y/);
    assert.match(o, /Check the hard drive's health\? \[Y\/n\] y/);
    assert.doesNotMatch(o, /Share Jarvis Core with your iPhone/);
    // packages, Node from NodeSource, the sparse clone
    assert.match(o, /would run: sudo env DEBIAN_FRONTEND=noninteractive apt-get -qq -o DPkg::Lock::Timeout=600 install -y --no-install-recommends git curl lm-sensors smartmontools/);
    assert.match(o, /Node\.js isn't installed\./);
    assert.match(o, /Installing Node\.js 24/);
    assert.match(o, /deb \[arch=amd64 signed-by=\/etc\/apt\/keyrings\/nodesource\.gpg\] https:\/\/deb\.nodesource\.com\/node_24\.x nodistro main/);
    assert.match(o, /would run: sudo env DEBIAN_FRONTEND=noninteractive apt-get .* install -y nodejs/);
    assert.match(o, /would run: git clone --quiet --depth 1 --filter=blob:none --sparse --branch main https:\/\/github\.com\/frankwise0202-maker\/jarvis\.git \S+\/jarvis-core-app/);
    assert.match(o, /would run: git -C \S+\/jarvis-core-app sparse-checkout set core/);
    // the command, the disk rule, the service, the screen
    assert.match(o, /would copy \S+\/jarvis-core-app\/core\/install\/jarvis-core to \S+\/\.local\/bin\/jarvis-core/);
    assert.ok(o.includes(RULE), 'the narrow smartctl rule is shown');
    assert.match(o, /check it with: sudo visudo -c/);
    assert.match(o, /ExecStart="\/usr\/bin\/node" "\S+\/jarvis-core-app\/core\/server\/main\.mjs"/);
    assert.match(o, /Restart=always/);
    assert.match(o, /WantedBy=default\.target/);
    assert.match(o, /would run: loginctl enable-linger frank-wise/);
    assert.match(o, /would run: systemctl --user enable --quiet jarvis-core\.service/);
    assert.match(o, /Exec="\S+\/\.local\/bin\/jarvis-core" screen/);
    assert.match(o, /--app=http:\/\/localhost:8788\/ --start-fullscreen --no-first-run --no-default-browser-check --password-store=basic --hide-crash-restore-bubble --disable-features=Translate,TranslateUI --noerrdialogs/);
    // screen settings with their current values and how to undo them
    assert.match(o, /would run: gsettings set org\.gnome\.desktop\.session idle-delay 'uint32 0'/);
    assert.match(o, /would run: gsettings set org\.gnome\.desktop\.screensaver lock-enabled false/);
    assert.match(o, /would run: gsettings set org\.gnome\.desktop\.screensaver ubuntu-lock-on-suspend false/);
    assert.match(o, /would run: gsettings set org\.gnome\.settings-daemon\.plugins\.power idle-dim false/);
    assert.match(o, /would run: gsettings set org\.gnome\.settings-daemon\.plugins\.power sleep-inactive-ac-type "'nothing'"|sleep-inactive-ac-type ''"'"'nothing'"'"''/);
    assert.match(o, /\(org\.gnome\.desktop\.session idle-delay is uint32 300 now\)/);
    assert.match(o, /gsettings reset org\.gnome\.desktop\.session idle-delay/);
    // the brain's libraries, in the downloaded core/
    assert.match(o, /would run in \S+\/jarvis-core-app\/core: npm ci --omit=dev --no-audit --no-fund/);
    // automatic updates: asked (Enter = yes), then the exact units and commands
    assert.match(o, /Keep Jarvis Core up to date automatically\? \[Y\/n\]/);
    assert.match(o, /13 of 13 · Automatic updates/);
    assert.match(o, /would write \S+\/\.config\/systemd\/user\/jarvis-core-autoupdate\.service:/);
    assert.match(o, /ExecStart="\S+\/\.local\/bin\/jarvis-core" autoupdate-tick/);
    assert.match(o, /Type=oneshot/);
    assert.match(o, /would write \S+\/\.config\/systemd\/user\/jarvis-core-autoupdate\.timer:/);
    assert.match(o, /OnUnitActiveSec=20min/);
    assert.match(o, /would run: systemctl --user enable --now jarvis-core-autoupdate\.timer/);
    assert.match(o, /goes back to the previous one by itself/);
    // automatic login, Tailscale's three commands, the final box
    assert.match(o, /set AutomaticLoginEnable=true and AutomaticLogin=frank-wise in the \[daemon\] section/);
    assert.match(o, /wget -qO- https:\/\/tailscale\.com\/install\.sh \| sh\n.*sudo tailscale up\n.*sudo tailscale serve --bg 8788/);
    assert.match(o, /Done\. Here's what to do next/);
    assert.match(o, /jarvis-core url/);
    assert.match(o, /That was a dry run: nothing was changed\./);
    assert.doesNotMatch(o, /funnel --|tailscale funnel/);
    assertNoChanges(sb, before);
  } finally {
    sb.cleanup();
  }
});

test('dry run: Ubuntu\'s old Node 18 is replaced, a logged-out Tailscale gets "tailscale up"', () => {
  const sb = makeSandbox({ tsMode: 'NeedsLogin', nodeVersion: 'v18.19.1', pkgs: ['git', 'curl'] });
  try {
    const before = snap(sb);
    const r = install(sb, ['--dry-run'], { answers: ['n', 'n', 'n'] });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Keep Jarvis Core up to date automatically\? \[Y\/n\] n/);
    assert.match(r.out, /Off \(you said no\)\. To turn it on later: jarvis-core autoupdate on/);
    assert.doesNotMatch(r.out, /jarvis-core-autoupdate\.(service|timer):/);
    assert.match(r.out, /Node\.js v18\.19\.1 is too old: Jarvis Core needs 22 or newer/);
    assert.match(r.out, /install -y --no-install-recommends lm-sensors\n/);
    assert.doesNotMatch(r.out, /no-install-recommends.*smartmontools/);
    assert.match(r.out, /Tailscale is installed but not connected \(NeedsLogin\)/);
    assert.match(r.out, /sudo tailscale up\n.*sudo tailscale serve --bg 8788/);
    assert.match(r.out, /Skipped: the dashboard will say "not checked" for disk health/);
    assert.match(r.out, /Left as it is: after a restart, log in once/);
    assertNoChanges(sb, before);
  } finally {
    sb.cleanup();
  }
});

test('dry run: Tailscale running with HTTPS certificates shows the exact address', () => {
  const sb = makeSandbox({ tsMode: 'Running', nodeVersion: 'v22.11.0', pkgs: ['git', 'curl', 'lm-sensors', 'smartmontools'] });
  try {
    const before = snap(sb);
    const r = install(sb, ['--dry-run'], { answers: ['n', 'y', 'y'] });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Tailscale is connected as alienware\.tail4e5f6a\.ts\.net/);
    assert.match(r.out, /Share Jarvis Core with your iPhone and Mac through Tailscale\? \[Y\/n\] y/);
    assert.match(r.out, /Node\.js 22\.11\.0 is installed .*; keeping it/);
    assert.match(r.out, /Already installed: git curl lm-sensors smartmontools/);
    assert.match(r.out, /would run: sudo tailscale serve --bg 8788/);
    assert.doesNotMatch(r.out, /HTTPS certificates/);
    assert.ok(r.out.includes(`The address will be: ${URL}`));
    assert.ok(r.out.includes(`       ${URL}`), 'the address is in the final box');
    assert.match(r.out, /Settings > Home base/);
    assertNoChanges(sb, before);
  } finally {
    sb.cleanup();
  }
});

test('dry run: Tailscale running without HTTPS certificates warns about the Enable link', () => {
  const sb = makeSandbox({ tsMode: 'Running', nodeVersion: 'v24.11.1' });
  try {
    const r = install(sb, ['--dry-run'], { answers: ['n', 'n', 'y'], env: { STUB_TS_CERTS: '0' } });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /would show Tailscale's link to turn on HTTPS certificates, and wait up to 10 minutes/);
  } finally {
    sb.cleanup();
  }
});

test('dry run: Tailscale stopped, or its service not running', () => {
  for (const [mode, re] of [
    ['Stopped', /installed but not connected \(Stopped\)[\s\S]*sudo tailscale up/],
    ['not-running', /its background service isn't running[\s\S]*sudo systemctl enable --now tailscaled/],
  ]) {
    const sb = makeSandbox({ tsMode: mode, nodeVersion: 'v22.11.0' });
    try {
      const r = install(sb, ['--dry-run'], { answers: ['n', 'n'] });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, re);
      assert.doesNotMatch(r.out, /Share Jarvis Core with your iPhone/);
    } finally {
      sb.cleanup();
    }
  }
});

test('no terminal: the safe default for each question (no automatic login), and says so', () => {
  const sb = makeSandbox({ tsMode: 'Running', nodeVersion: 'v22.11.0' });
  try {
    const before = snap(sb);
    const r = install(sb, ['--dry-run'], { noTty: true });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /No terminal to answer in .*taking the safe answer/);
    assert.match(r.out, /Log in automatically when the computer starts\? \[y\/N\] \(no terminal to answer in: no\)/);
    assert.match(r.out, /Check the hard drive's health\? \[Y\/n\] \(no terminal to answer in: yes\)/);
    assert.match(r.out, /Share Jarvis Core with your iPhone and Mac through Tailscale\? \[Y\/n\] \(no terminal to answer in: yes\)/);
    assert.match(r.out, /Keep Jarvis Core up to date automatically\? \[Y\/n\] \(no terminal to answer in: yes\)/);
    assert.match(r.out, /Left as it is: after a restart, log in once/);
    assert.doesNotMatch(r.out, /AutomaticLoginEnable=true/);
    assertNoChanges(sb, before);
  } finally {
    sb.cleanup();
  }
});

test('a password sudo remembers in this terminal is not the disk-check permission', () => {
  // After "sudo tailscale up", real sudo answers "sudo -n -l smartctl ..." with yes for 15 minutes in that
  // terminal (the owner's own "%sudo ALL" rule), while the Core, started by systemd with no terminal,
  // is still asked for a password. The installer and jarvis-core must not take one for the other.
  const sb = makeSandbox({ tsMode: 'missing', nodeVersion: 'v22.11.0' });
  try {
    const env = { STUB_SUDO_CACHED: '1' };
    const e = { ...sb.env, ...env };
    const ask = ['-n', '-l', '/usr/sbin/smartctl', '-j', '-H', '-A', '-i', '/dev/sda'];
    assert.equal(spawnSync('sudo', ask, { env: e }).status, 0, 'the stub sudo says yes in this terminal, like real sudo');
    assert.equal(spawnSync('setsid', ['-w', 'sudo', ...ask], { env: e }).status, 1, 'and no from a session of its own');
    // the question is still asked, and the rule would be written
    let r = install(sb, ['--dry-run'], { answers: ['n', 'y'], env });
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /may already read the hard drive's health/);
    assert.match(r.out, /Check the hard drive's health\? \[Y\/n\] y/);
    assert.ok(r.out.includes(RULE), 'the smartctl rule is shown');
    // jarvis-core uninstall doesn't claim to remove a permission that isn't there
    const bin = path.join(sb.home, '.local/bin/jarvis-core');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.copyFileSync(CLI, bin);
    fs.chmodSync(bin, 0o755);
    r = cli(sb, ['uninstall', '--yes'], { env });
    assert.doesNotMatch(r.out, /Removed the disk-check permission/);
    assert.ok(!stubLog(sb).some((l) => l.includes(`rm -f ${sb.env.JARVIS_CORE_SUDOERS_FILE}`)), 'nothing to remove');
    // once the rule is there, the question is skipped
    fs.writeFileSync(sb.env.JARVIS_CORE_SUDOERS_FILE, `${RULE}\n`);
    r = install(sb, ['--dry-run'], { answers: ['n'], env });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /✓ Jarvis Core may already read the hard drive's health/);
    assert.doesNotMatch(r.out, /Check the hard drive's health\?/);
  } finally {
    sb.cleanup();
  }
});

test("the owner's guide says how to paste in Terminal at its first paste (Ctrl+V doesn't work there)", () => {
  const md = fs.readFileSync(path.join(CORE, 'README.md'), 'utf8');
  const first = md.search(/\bpaste\b/i);
  const how = md.indexOf('Ctrl+Shift+V');
  assert.ok(first > 0 && how > first && how - first < 200, 'the how-to is right at the first "paste"');
  assert.match(md, /right-click and choose \*\*Paste\*\*/);
});

test('refuses to run as root, and outside Ubuntu', () => {
  const sb = makeSandbox();
  try {
    fs.writeFileSync(path.join(sb.stubs, 'id'), '#!/bin/bash\ncase "$*" in -u) echo 0 ;; -un) echo root ;; *) exec /usr/bin/id "$@" ;; esac\n', { mode: 0o755 });
    const r = install(sb, ['--dry-run']);
    assert.equal(r.code, 1);
    assert.match(r.out, /not with sudo or as root/);
  } finally {
    sb.cleanup();
  }
  const sb2 = makeSandbox();
  try {
    fs.writeFileSync(sb2.env.JARVIS_CORE_OS_RELEASE, 'ID=fedora\nPRETTY_NAME="Fedora Linux 41"\n');
    const r = install(sb2, ['--dry-run']);
    assert.equal(r.code, 1);
    assert.match(r.out, /This installer is for Ubuntu \(this computer runs Fedora Linux 41\)/);
  } finally {
    sb2.cleanup();
  }
});

// ------------------------------------------------------------------------------------------ real run in a sandbox

test('install, re-run, CLI and uninstall in a sandbox (stubbed system, real Core)', async (t) => {
  const sb = makeSandbox({ tsMode: 'Running', nodeVersion: 'v22.11.0', pkgs: ['git', 'curl'] });
  const repo = makeRepo(sb.root);
  const port = await freePort();
  const env = { JARVIS_CORE_REPO: repo.url, JARVIS_CORE_PORT: String(port), STUB_TS_CERTS: '0', STUB_TS_ENABLES: '1' };
  const app = path.join(sb.home, 'jarvis-core-app');
  const unitFile = path.join(sb.home, '.config/systemd/user/jarvis-core.service');
  const autostart = path.join(sb.home, '.config/autostart/jarvis-core-screen.desktop');
  const stateDir = path.join(sb.home, '.config/jarvis-core/install');
  const auService = path.join(sb.home, '.config/systemd/user/jarvis-core-autoupdate.service');
  const auTimer = path.join(sb.home, '.config/systemd/user/jarvis-core-autoupdate.timer');
  const dataDir = path.join(sb.home, '.local/share/jarvis-core');
  const head = () => execFileSync('git', ['-C', app, 'rev-parse', 'HEAD']).toString().trim();
  const ping = async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/api/ping`)).ok;
    } catch {
      return false;
    }
  };
  const db = () => Object.fromEntries(fs.readFileSync(path.join(sb.stubs, 'gsettings.db'), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  try {
    await t.test('first install: answers yes, yes, yes, yes', () => {
      const r = install(sb, [], { answers: ['y', 'y', 'y', 'y'], env });
      assert.equal(r.code, 0, r.out);
      const o = r.out;
      assert.doesNotMatch(o, /dry run/);
      // packages: only what was missing; Node kept
      const log = stubLog(sb);
      assert.ok(log.some((l) => /^apt-get .*install -y --no-install-recommends lm-sensors smartmontools$/.test(l)), log.join('\n'));
      assert.match(o, /Node\.js 22\.11\.0 is installed/);
      // the sparse clone of core/ only
      assert.ok(fs.existsSync(path.join(app, 'core/server/main.mjs')));
      assert.ok(!fs.existsSync(path.join(app, 'src')), 'only core/ is checked out');
      assert.equal(execFileSync('git', ['-C', app, 'sparse-checkout', 'list']).toString().trim(), 'core');
      assert.equal(execFileSync('git', ['-C', app, 'rev-parse', '--is-shallow-repository']).toString().trim(), 'true');
      // the command and its shortcut (~/.local/bin is not on PATH here)
      assert.equal(fs.readFileSync(path.join(sb.home, '.local/bin/jarvis-core'), 'utf8'), fs.readFileSync(CLI, 'utf8'));
      const shim = fs.readFileSync(sb.env.JARVIS_CORE_SHIM, 'utf8');
      assert.match(shim, /\[ "\$\(id -u\)" = 1000 \] \|\|/);
      assert.match(shim, new RegExp(`exec '${sb.home}/.local/bin/jarvis-core' "\\$@"`));
      // the disk-health rule, checked with visudo
      assert.equal(fs.readFileSync(sb.env.JARVIS_CORE_SUDOERS_FILE, 'utf8').trim().split('\n').pop(), RULE);
      assert.equal((fs.statSync(sb.env.JARVIS_CORE_SUDOERS_FILE).mode & 0o777).toString(8), '440');
      assert.ok(log.some((l) => /^visudo -c -q -f /.test(l)) && log.includes('visudo -c -q'));
      // the service: written, lingering on, started, and the real Core answered on its port
      const unit = fs.readFileSync(unitFile, 'utf8');
      assert.match(unit, new RegExp(`ExecStart="${sb.stubs}/node" "${app}/core/server/main.mjs"`));
      assert.match(unit, /Restart=always\nRestartSec=3/);
      assert.match(unit, /StartLimitIntervalSec=0/);
      assert.equal(fs.readFileSync(path.join(sb.stubs, 'linger'), 'utf8').trim(), 'yes');
      assert.match(o, new RegExp(`✓ Jarvis Core is running: http://localhost:${port}/`));
      // the screen
      assert.match(fs.readFileSync(autostart, 'utf8'), new RegExp(`Exec="${sb.home}/.local/bin/jarvis-core" screen`));
      // screen settings, with the originals remembered once
      assert.deepEqual(db(), {
        'org.gnome.desktop.session idle-delay': 'uint32 0',
        'org.gnome.desktop.screensaver lock-enabled': 'false',
        'org.gnome.desktop.screensaver ubuntu-lock-on-suspend': 'false',
        'org.gnome.settings-daemon.plugins.power idle-dim': 'false',
        'org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type': "'nothing'",
      });
      const saved = fs.readFileSync(path.join(stateDir, 'gsettings-before'), 'utf8').trim().split('\n');
      assert.equal(saved.length, 5);
      for (const line of saved) {
        const [schema, key, value] = line.split('\t');
        assert.equal(value, GSETTINGS_DEFAULTS[`${schema} ${key}`]);
      }
      // automatic login, with a backup of the original
      const gdm = fs.readFileSync(sb.env.JARVIS_CORE_GDM_CONF, 'utf8');
      assert.match(gdm, /\[daemon\]\nAutomaticLoginEnable=true\nAutomaticLogin=frank-wise\n# Uncomment the line below/);
      assert.match(gdm, /#  AutomaticLoginEnable = true/, 'comments are kept');
      assert.equal(fs.readFileSync(`${sb.env.JARVIS_CORE_GDM_CONF}.before-jarvis-core`, 'utf8'), GDM_STOCK);
      // Tailscale: certificates were off, the link was shown, the owner clicked Enable, serve is on
      assert.match(o, /HTTPS certificates are turned off[\s\S]*click Enable/);
      assert.match(o, /https:\/\/login\.tailscale\.com\/f\/serve\?node=nAbC123/);
      assert.match(o, /Success\./);
      assert.ok(o.includes(`Shared with your devices only, over HTTPS: ${URL}`));
      assert.ok(log.some((l) => l === `sudo timeout --foreground 600 ${path.join(sb.stubs, 'tailscale')} serve --bg ${port}`), 'serve under sudo with a time limit');
      assert.ok(!log.some((l) => /funnel/.test(l)));
      assert.ok(o.includes(`       ${URL}`), 'the address is in the final box');
      assert.doesNotMatch(o, /Still to do by hand/);
      const state = fs.readFileSync(path.join(stateDir, 'state'), 'utf8');
      for (const kv of ['sudoers=installed', 'linger=enabled-by-installer', 'autologin=enabled-by-installer', 'serve=enabled-by-installer']) {
        assert.ok(state.includes(kv), `state has ${kv}`);
      }
      // the brain's libraries: npm ci in a fresh folder, swapped in, stamped with the lockfile's hash
      assert.ok(log.includes(`npm ci --omit=dev --no-audit --no-fund (in ${app}/core/.npm-install)`), log.filter((l) => l.startsWith('npm')).join('\n'));
      assert.ok(fs.existsSync(path.join(app, 'core/node_modules/.stub-npm-ci')));
      assert.ok(!fs.existsSync(path.join(app, 'core/.npm-install')), 'the staging folder is gone');
      const lockHash = execFileSync('sha256sum', [path.join(app, 'core/package-lock.json')]).toString().split(' ')[0];
      assert.equal(fs.readFileSync(path.join(app, 'core/node_modules/.jarvis-lock-sha256'), 'utf8').trim(), lockHash);
      // what it installs (the speech libraries too, about 460 MB) and how long that can take
      assert.match(o, /Installing the brain's libraries with npm ci: the Claude SDK, web-push and the speech libraries,\n\s+about 460 MB\. The first time this can take several minutes\.\.\.\n/);
      assert.doesNotMatch(o, /a minute or two/);
      assert.match(o, /✓ Installed the brain's libraries \(the Claude SDK, web-push and the speech libraries\)/);
      // automatic updates: the timer and its service, enabled
      const svc = fs.readFileSync(auService, 'utf8');
      assert.ok(svc.includes(`ExecStart="${sb.home}/.local/bin/jarvis-core" autoupdate-tick`), svc);
      assert.match(svc, /Type=oneshot/);
      assert.match(fs.readFileSync(auTimer, 'utf8'), /OnBootSec=5min\nOnUnitActiveSec=20min/);
      assert.ok(fs.existsSync(path.join(sb.stubs, 'enabled@jarvis-core-autoupdate.timer')), 'the timer is enabled');
      assert.ok(log.includes('systemctl --user enable --now --quiet jarvis-core-autoupdate.timer'));
      assert.match(o, /On: every 20 minutes Jarvis Core looks for a new version on GitHub/);
      assert.match(o, /It keeps itself up to date \(jarvis-core autoupdate status\)/);
    });

    await t.test('a dry run after installing: everything already in place', () => {
      fs.writeFileSync(sb.log, '');
      const before = snap(sb);
      const r = install(sb, ['--dry-run'], { env: { ...env, STUB_PKGS: 'git curl lm-sensors smartmontools' } });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Jarvis Core is already installed: this run updates and repairs it/);
      assert.match(r.out, /Automatic login is already on for frank-wise/);
      assert.match(r.out, /Jarvis Core may already read the hard drive's health/);
      assert.match(r.out, /Tailscale already passes Jarvis Core to your devices/);
      assert.match(r.out, /Jarvis Core already keeps itself up to date/);
      assert.match(r.out, /The brain's libraries are installed/);
      assert.doesNotMatch(r.out, /\? .*\[[yY]\/[nN]\]/, 'no questions left to ask');
      assert.match(r.out, /would update \S+ to the latest version: git pull --ff-only/);
      assert.match(r.out, /The service is already set up/);
      assert.match(r.out, /The dashboard already starts at every login/);
      assert.match(r.out, /Already set: the screen never blanks/);
      assert.match(r.out, /Lingering is on/);
      assert.ok(r.out.includes(`Shared with your devices only: ${URL}`));
      assert.doesNotMatch(r.out, /would write/);
      assertNoChanges(sb, before);
    });

    await t.test('running it again changes nothing that is already right', () => {
      const keep = {
        unit: fs.readFileSync(unitFile, 'utf8'),
        autostart: fs.readFileSync(autostart, 'utf8'),
        before: fs.readFileSync(path.join(stateDir, 'gsettings-before'), 'utf8'),
        gdm: fs.readFileSync(sb.env.JARVIS_CORE_GDM_CONF, 'utf8'),
      };
      fs.writeFileSync(sb.log, '');
      const r = install(sb, [], { answers: [], env: { ...env, STUB_PKGS: 'git curl lm-sensors smartmontools' } });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /is up to date \(/);
      assert.equal(fs.readFileSync(unitFile, 'utf8'), keep.unit);
      assert.equal(fs.readFileSync(autostart, 'utf8'), keep.autostart);
      assert.equal(fs.readFileSync(path.join(stateDir, 'gsettings-before'), 'utf8'), keep.before, 'originals are remembered only once');
      assert.equal(fs.readFileSync(sb.env.JARVIS_CORE_GDM_CONF, 'utf8'), keep.gdm);
      const log = stubLog(sb);
      assert.ok(!log.some((l) => /^apt-get/.test(l)), 'no apt when nothing is missing');
      assert.ok(!log.some((l) => /^gsettings set/.test(l)), 'no settings changed again');
      assert.ok(!log.some((l) => /^tailscale serve --bg/.test(l)), 'serve not run again');
      assert.ok(!log.some((l) => /^npm ci/.test(l)), 'npm ci only when the lockfile changed');
      assert.ok(log.includes('systemctl --user restart jarvis-core.service'), 'the Core restarts to load the latest code');
      assert.match(r.out, new RegExp(`Jarvis Core is running: http://localhost:${port}/`));
    });

    await t.test('jarvis-core screen --print-args: Chrome\'s exact command line', () => {
      const r = cli(sb, ['screen', '--print-args'], { env });
      assert.equal(r.code, 0, r.out);
      assert.deepEqual(r.stdout.trim().split('\n'), [
        path.join(sb.stubs, 'google-chrome-stable'),
        `--user-data-dir=${sb.home}/.local/share/jarvis-core-screen`,
        `--app=http://localhost:${port}/`,
        '--start-fullscreen',
        '--no-first-run',
        '--no-default-browser-check',
        '--password-store=basic',
        '--hide-crash-restore-bubble',
        '--disable-features=Translate,TranslateUI',
        '--noerrdialogs',
      ]);
    });

    await t.test('jarvis-core screen: marks the last exit clean, then starts Chrome', () => {
      const prefs = path.join(sb.home, '.local/share/jarvis-core-screen/Default/Preferences');
      fs.mkdirSync(path.dirname(prefs), { recursive: true });
      fs.writeFileSync(prefs, JSON.stringify({ profile: { exit_type: 'Crashed', exited_cleanly: false, name: 'Jarvis' }, other: 1 }));
      fs.writeFileSync(sb.log, '');
      const r = cli(sb, ['screen', '--no-wait'], { env });
      assert.equal(r.code, 0, r.out);
      const p = JSON.parse(fs.readFileSync(prefs, 'utf8'));
      assert.deepEqual(p.profile, { exit_type: 'Normal', exited_cleanly: true, name: 'Jarvis' });
      assert.equal(p.translate.enabled, false);
      assert.equal(p.other, 1);
      assert.ok(fs.existsSync(path.join(sb.home, '.local/share/jarvis-core-screen/First Run')));
      assert.ok(stubLog(sb).some((l) => l.startsWith(`google-chrome-stable --user-data-dir=${sb.home}/.local/share/jarvis-core-screen --app=`)));
    });

    await t.test('jarvis-core status and url', () => {
      let r = cli(sb, ['url'], { env });
      assert.equal(r.code, 0, r.out);
      assert.ok(r.out.includes(`On your iPhone and Mac:  ${URL}`));
      assert.match(r.out, /Settings > Home base/);
      r = cli(sb, ['status'], { env });
      assert.match(r.out, /✓ Running/);
      assert.match(r.out, /✓ Health: All systems normal/);
      assert.match(r.out, /Starts by itself when the computer starts/);
      assert.match(r.out, /Keeps itself up to date/);
      assert.ok(r.out.includes(URL));
    });

    await t.test('update: refuses to overwrite local changes; fast-forwards; --force keeps a backup', () => {
      const changed = path.join(app, 'core/server/version.mjs');
      fs.appendFileSync(changed, '// edited on the Alienware\n');
      let r = cli(sb, ['update'], { env });
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /were changed on this computer, so I won't overwrite them/);
      assert.match(r.out, /core\/server\/version\.mjs/);
      // the installer also leaves the changed copy alone
      r = install(sb, ['--dry-run'], { env });
      assert.match(r.out, /leaving that copy as it is/);
      execFileSync('git', ['-C', app, 'checkout', '--', 'core/server/version.mjs']);
      // a new version upstream arrives with a fast-forward, then the refresh restarts the Core
      fs.appendFileSync(path.join(repo.work, 'core/server/README.md'), '\nA new line.\n');
      repo.commit('upstream change');
      r = cli(sb, ['update'], { env });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /✓ Updated to [0-9a-f]+/);
      assert.match(r.out, /Refreshing Jarvis Core/);
      assert.match(r.out, new RegExp(`Jarvis Core is running: http://localhost:${port}/`));
      assert.match(r.out, /Jarvis Core is up to date\./);
      assert.match(fs.readFileSync(path.join(app, 'core/server/README.md'), 'utf8'), /A new line\./);
      // --force: the old copy is moved aside, never deleted
      fs.appendFileSync(changed, '// edited again\n');
      r = cli(sb, ['update', '--force'], { env });
      assert.equal(r.code, 0, r.out);
      const backups = fs.readdirSync(sb.home).filter((n) => n.startsWith('jarvis-core-app.old-'));
      assert.equal(backups.length, 1);
      assert.match(fs.readFileSync(path.join(sb.home, backups[0], 'core/server/version.mjs'), 'utf8'), /edited again/);
      assert.doesNotMatch(fs.readFileSync(changed, 'utf8'), /edited/);
      fs.rmSync(path.join(sb.home, backups[0]), { recursive: true, force: true });
    });

    await t.test('autoupdate-tick: nothing new, a change outside core/, then a real update that answers', async () => {
      const tick = (extra = {}) => cli(sb, ['autoupdate-tick'], { env: { ...env, JARVIS_CORE_UPDATE_CHECK_SEC: '1', JARVIS_CORE_START_WAIT_SEC: '10', ...extra } });
      fs.writeFileSync(sb.log, '');
      let r = tick();
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Up to date: GitHub's core\/ is the same as this copy's/);
      assert.ok(!stubLog(sb).some((l) => /restart jarvis-core/.test(l)), 'nothing restarted');
      // the app changes on GitHub, core/ does not: no update
      const before = head();
      fs.appendFileSync(path.join(repo.work, 'src/app.js'), '// the app moved on\n');
      repo.commit('app only');
      r = tick();
      assert.match(r.out, /Up to date/);
      assert.equal(head(), before);
      // core/ changes: update, 1 s later it answers, logged for the event log
      fs.appendFileSync(path.join(repo.work, 'core/server/README.md'), '\nTick update.\n');
      repo.commit('core change');
      r = tick();
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /A new version is on GitHub \([0-9a-f]+\): updating from [0-9a-f]+/);
      assert.match(r.out, /Updated to [0-9a-f]+; it answers/);
      assert.notEqual(head(), before);
      assert.match(fs.readFileSync(path.join(app, 'core/server/README.md'), 'utf8'), /Tick update\./);
      assert.ok(await ping());
      const events = fs.readFileSync(path.join(dataDir, 'update-events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert.equal(events.at(-1).rule, 'core.update');
      assert.equal(events.at(-1).level, 'info');
      assert.match(events.at(-1).message, /^Jarvis Core updated itself to [0-9a-f]+ \(from [0-9a-f]+\)$/);
      assert.ok(Number.isFinite(events.at(-1).t));
      assert.match(fs.readFileSync(path.join(dataDir, 'autoupdate.log'), 'utf8'), /Updated to/);
      assert.match(cli(sb, ['autoupdate', 'status'], { env }).out, /On: every 20 minutes[\s\S]*Last check: [\s\S]*Last update: /);
    });

    await t.test('autoupdate-tick: a new version that does not answer is rolled back, logged, and not tried again', async () => {
      const tick = () => cli(sb, ['autoupdate-tick'], { env: { ...env, JARVIS_CORE_UPDATE_CHECK_SEC: '1', JARVIS_CORE_START_WAIT_SEC: '3' } });
      const good = head();
      const mainFile = path.join(repo.work, 'core/server/main.mjs');
      const original = fs.readFileSync(mainFile, 'utf8');
      fs.writeFileSync(mainFile, original.replace('#!/usr/bin/env node\n', '#!/usr/bin/env node\nthrow new Error("broken on purpose");\n'));
      repo.commit('a broken version');
      let r = tick();
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /isn't answering 1 seconds after the update: going back to [0-9a-f]+/);
      assert.match(r.out, /Back on [0-9a-f]+, and it answers/);
      // the broken version's refresh ends with what happened, never "up to date" after its ✗
      const broken = r.out.slice(0, r.out.indexOf('going back to'));
      assert.match(broken, /✗ Jarvis Core didn't answer within 3 seconds/);
      assert.match(broken, /\nJarvis Core isn't answering\. Check it: jarvis-core status, then jarvis-core logs\n/);
      assert.doesNotMatch(broken, /Jarvis Core is up to date/);
      assert.match(r.out.slice(r.out.indexOf('going back to')), /\nJarvis Core is up to date\.\n/, 'the previous version answers again');
      assert.equal(head(), good, 'back on the version before');
      assert.ok(await ping(), 'the previous version runs again');
      const events = fs.readFileSync(path.join(dataDir, 'update-events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert.equal(events.at(-1).rule, 'core.rollback');
      assert.equal(events.at(-1).level, 'warn');
      assert.match(events.at(-1).message, /didn't start properly, so Jarvis Core went back to/);
      assert.match(fs.readFileSync(path.join(stateDir, 'autoupdate'), 'utf8'), /^bad_tree=[0-9a-f]{40}$/m);
      // the next check leaves that version alone; libraries that aren't right (going back can need the
      // previous version's) are tried again there too
      fs.rmSync(path.join(app, 'core/node_modules/.jarvis-lock-sha256'));
      r = cli(sb, ['autoupdate-tick'], { env: { ...env, JARVIS_CORE_UPDATE_CHECK_SEC: '1', JARVIS_CORE_START_WAIT_SEC: '10' } });
      assert.match(r.out, /Skipping [0-9a-f]+: it didn't start properly last time/);
      assert.match(r.out, /Installed the brain's libraries; Jarvis Core restarted to load them, and it answers/);
      assert.equal(head(), good);
      assert.match(cli(sb, ['autoupdate', 'status'], { env }).out, /Went back to the previous version once/);
      // the fixed version is taken
      fs.writeFileSync(mainFile, original);
      fs.appendFileSync(path.join(repo.work, 'core/server/README.md'), '\nFixed.\n');
      repo.commit('fixed');
      r = tick();
      assert.match(r.out, /Updated to [0-9a-f]+; it answers/);
      assert.ok(await ping());
    });

    await t.test('an update whose npm ci fails still completes, keeps the old libraries and the Core running', async () => {
      fs.rmSync(path.join(app, 'core/node_modules/.jarvis-lock-sha256'));
      fs.appendFileSync(path.join(repo.work, 'core/server/README.md'), '\nOffline npm.\n');
      repo.commit('needs npm');
      const r = cli(sb, ['update'], { env: { ...env, STUB_NPM_FAIL: '1' } });
      assert.equal(r.code, 0, r.out);
      // the libraries that were there are still the ones in use, and it says so (not "runs without them")
      assert.match(r.out, /! Couldn't install this version's libraries \(npm ci failed: no internet\?\)\. The previous ones are\n\s+still in use\. npm said:/);
      assert.doesNotMatch(r.out, /runs without/);
      assert.match(r.out, /EAI_AGAIN/);
      assert.match(r.out, /Automatic updates try again by themselves \(jarvis-core autoupdate status says when\)\./);
      assert.match(r.out, new RegExp(`Jarvis Core is running: http://localhost:${port}/`));
      assert.match(r.out, /\nJarvis Core is up to date, except for the brain's libraries \(see above\)\.\n/);
      assert.ok(fs.existsSync(path.join(app, 'core/node_modules/.stub-npm-ci')), 'the libraries that were there stay');
      assert.ok(!fs.existsSync(path.join(app, 'core/.npm-install')));
      assert.ok(await ping());
      // with no libraries at all before, the Core runs without them, and it says that instead
      fs.rmSync(path.join(app, 'core/node_modules'), { recursive: true, force: true });
      const r1 = cli(sb, ['update'], { env: { ...env, STUB_NPM_FAIL: '1' } });
      assert.equal(r1.code, 0, r1.out);
      assert.match(r1.out, /! Couldn't install the brain's libraries \(npm ci failed: no internet\?\)\. Jarvis Core runs without\n\s+them for now: its Claude work, notifications and speech are off\. npm said:/);
      assert.doesNotMatch(r1.out, /still in use/);
      assert.ok(!fs.existsSync(path.join(app, 'core/node_modules')));
      // the next update with the internet back installs them
      const r2 = cli(sb, ['update'], { env });
      assert.match(r2.out, /Installed the brain's libraries/);
    });

    await t.test('autoupdate-tick: libraries an update could not install are tried again, then at most every 2 hours; the Core restarts once they are in', async () => {
      const tick = (extra = {}) => cli(sb, ['autoupdate-tick'], { env: { ...env, JARVIS_CORE_UPDATE_CHECK_SEC: '1', JARVIS_CORE_START_WAIT_SEC: '10', ...extra } });
      const marker = path.join(app, 'core/node_modules/.jarvis-lock-sha256');
      const lockHash = () => execFileSync('sha256sum', [path.join(app, 'core/package-lock.json')]).toString().split(' ')[0];
      const auState = path.join(stateDir, 'autoupdate');
      const npmRuns = () => stubLog(sb).filter((l) => l.startsWith('npm ci')).length;
      const restarts = () => stubLog(sb).filter((l) => l === 'systemctl --user restart jarvis-core.service').length;
      const lastEvent = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'update-events.jsonl'), 'utf8').trim().split('\n').at(-1));
      // a version with new libraries arrives while npm's registry is down: the update goes ahead, the old libraries stay
      fs.appendFileSync(path.join(repo.work, 'core/package-lock.json'), '\n');
      repo.commit('new libraries');
      let r = tick({ STUB_NPM_FAIL: '1' });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Updated to [0-9a-f]+; it answers, but the brain's libraries didn't install \(the next check tries again\)/);
      assert.notEqual(fs.readFileSync(marker, 'utf8').trim(), lockHash(), 'the previous libraries are still the ones in place');
      assert.match(lastEvent().message, /^Jarvis Core updated itself to [0-9a-f]+ \(from [0-9a-f]+\), but couldn't install the brain's libraries yet; it tries again by itself$/);
      let s = cli(sb, ['status'], { env }).out;
      assert.match(s, /! The brain's libraries are out of date \(this version needs new ones\)\.\n\s+The next automatic update check tries again\./);
      assert.doesNotMatch(s, /✓ The brain's libraries are installed/);
      assert.match(cli(sb, ['autoupdate', 'status'], { env }).out, /! The brain's libraries are out of date[^\n]*\n\s+The next automatic update check tries again\./);
      // the next check: GitHub has nothing newer, so it tries the libraries again; still offline, so it fails,
      // restarts nothing, and says when it tries next
      fs.writeFileSync(sb.log, '');
      r = tick({ STUB_NPM_FAIL: '1' });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Up to date: GitHub's core\/ is the same as this copy's\./);
      assert.match(r.out, /The brain's libraries are out of date \(this version needs new ones\): installing them again/);
      assert.equal(npmRuns(), 1, 'npm ci ran once');
      assert.equal(restarts(), 0, 'a try that fails restarts nothing');
      assert.match(r.out, /The brain's libraries still didn't install; the next try is at the first check after \w+ \d+ \d+:\d\d [AP]M/);
      assert.match(fs.readFileSync(auState, 'utf8'), /^libs_failed=\d+$/m);
      assert.match(cli(sb, ['autoupdate', 'status'], { env }).out, /The last try failed \(\w+ \d+ \d+:\d\d [AP]M\); the next automatic update check after \w+ \d+ \d+:\d\d [AP]M tries again\./);
      assert.match(cli(sb, ['status'], { env }).out, /the next automatic update check after \w+ \d+ \d+:\d\d [AP]M tries again/);
      // the checks of the next 2 hours leave npm alone, even with the internet back
      fs.writeFileSync(sb.log, '');
      r = tick();
      assert.equal(r.code, 0, r.out);
      assert.equal(npmRuns(), 0, 'no npm within 2 hours of a failed try');
      assert.match(r.out, /Up to date[\s\S]*The brain's libraries are out of date \(this version needs new ones\): the next try is at the first check after/);
      // 2 hours later: they go in, the Core restarts once to load them, and it answers
      const failedAt = Number(/^libs_failed=(\d+)$/m.exec(fs.readFileSync(auState, 'utf8'))[1]);
      fs.writeFileSync(auState, fs.readFileSync(auState, 'utf8').replace(/^libs_failed=\d+$/m, `libs_failed=${failedAt - 7200}`));
      fs.writeFileSync(sb.log, '');
      r = tick();
      assert.equal(r.code, 0, r.out);
      assert.equal(npmRuns(), 1);
      assert.equal(restarts(), 1, 'restarted once, to load them');
      assert.equal(fs.readFileSync(marker, 'utf8').trim(), lockHash());
      assert.match(r.out, /Installed the brain's libraries; Jarvis Core restarted to load them, and it answers/);
      assert.ok(await ping());
      assert.doesNotMatch(fs.readFileSync(auState, 'utf8'), /libs_failed/);
      assert.deepEqual([lastEvent().rule, lastEvent().level], ['core.update', 'info']);
      assert.match(lastEvent().message, /installed the brain's libraries/);
      assert.match(cli(sb, ['status'], { env }).out, /✓ The brain's libraries are installed \(Claude, notifications and speech\)/);
      assert.doesNotMatch(cli(sb, ['autoupdate', 'status'], { env }).out, /! The brain's libraries/);
      // from then on a check is a plain "up to date"
      fs.writeFileSync(sb.log, '');
      r = tick();
      assert.match(r.out, /^Up to date: GitHub's core\/ is the same as this copy's\.\n$/);
      assert.equal(npmRuns() + restarts(), 0);
      // no libraries at all (an install whose npm ci failed): the first check installs them, no waiting
      fs.rmSync(path.join(app, 'core/node_modules'), { recursive: true, force: true });
      assert.match(cli(sb, ['status'], { env }).out, /! The brain's libraries are missing, so Claude work, notifications and speech are off\./);
      fs.writeFileSync(sb.log, '');
      r = tick();
      assert.equal(r.code, 0, r.out);
      assert.equal(npmRuns(), 1);
      assert.equal(restarts(), 1);
      assert.equal(fs.readFileSync(marker, 'utf8').trim(), lockHash());
      assert.ok(await ping());
      // the installer's libraries step on its own: true when they are in place, false (old ones kept) when not
      r = install(sb, ['--libraries'], { env });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /━━ The brain's libraries\n  ✓ The brain's libraries are installed \(the Claude SDK, web-push and the speech libraries\)\n/);
      fs.rmSync(marker);
      r = install(sb, ['--libraries'], { env: { ...env, STUB_NPM_FAIL: '1' } });
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /The previous ones are\n\s+still in use/);
      assert.ok(fs.existsSync(path.join(app, 'core/node_modules/.stub-npm-ci')));
      r = install(sb, ['--libraries'], { env });
      assert.equal(r.code, 0, r.out);
      assert.equal(fs.readFileSync(marker, 'utf8').trim(), lockHash());
    });

    await t.test('autoupdate off and on; a timer set up by hand is taken over by the next update', () => {
      let r = cli(sb, ['autoupdate', 'off'], { env });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Off: Jarvis Core no longer updates itself/);
      assert.ok(!fs.existsSync(auService) && !fs.existsSync(auTimer));
      assert.ok(!fs.existsSync(path.join(sb.stubs, 'enabled@jarvis-core-autoupdate.timer')));
      assert.match(cli(sb, ['autoupdate', 'status'], { env }).out, /Off\. Turn it on: jarvis-core autoupdate on/);
      assert.match(cli(sb, ['status'], { env }).out, /Automatic updates are off/);
      // what the owner pasted by hand tonight: a script and two units with the same names
      const script = path.join(sb.home, '.local/bin/jarvis-core-autoupdate');
      fs.writeFileSync(script, '#!/bin/bash\n# hand-made: update when core/ changed\nexec jarvis-core update\n', { mode: 0o755 });
      fs.writeFileSync(auService, '[Unit]\nDescription=Jarvis Core auto-update\n\n[Service]\nType=oneshot\nExecStart=%h/.local/bin/jarvis-core-autoupdate\n');
      fs.writeFileSync(auTimer, '[Timer]\nOnBootSec=5min\nOnUnitActiveSec=20min\n\n[Install]\nWantedBy=timers.target\n');
      fs.writeFileSync(path.join(sb.stubs, 'enabled@jarvis-core-autoupdate.timer'), '');
      assert.match(cli(sb, ['autoupdate', 'status'], { env }).out, /On, with the timer you set up by hand/);
      r = install(sb, ['--refresh'], { env });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Took over the update timer you set up by hand/);
      assert.ok(!fs.existsSync(script), 'the hand-made script is gone');
      assert.match(fs.readFileSync(auService, 'utf8'), /ExecStart="\S+\/\.local\/bin\/jarvis-core" autoupdate-tick/);
      assert.match(fs.readFileSync(auTimer, 'utf8'), /RandomizedDelaySec=60/);
      assert.match(cli(sb, ['autoupdate', 'status'], { env }).out, /On: every 20 minutes/);
      // and on by hand again
      cli(sb, ['autoupdate', 'off'], { env });
      r = cli(sb, ['autoupdate', 'on'], { env });
      assert.equal(r.code, 0, r.out);
      assert.ok(fs.existsSync(auService) && fs.existsSync(path.join(sb.stubs, 'enabled@jarvis-core-autoupdate.timer')));
    });

    await t.test('a refresh run by the update timer leaves the screen\'s Chrome alone; from a terminal it reopens it', async () => {
      // A Chrome started from inside the timer's service would be stopped with it at the end of the job,
      // leaving the screen without its dashboard: the refresh must not touch it there.
      const profile = path.join(sb.home, '.local/share/jarvis-core-screen');
      // a stand-in that keeps its command line (bash would exec a lone `sleep` and lose the arguments)
      const chrome = spawn('bash', ['-c', 'trap "exit 0" TERM; sleep 60 & wait', 'google-chrome-stable', `--user-data-dir=${profile}`], { stdio: 'ignore' });
      const alive = () => {
        try {
          process.kill(chrome.pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      const cg = path.join(sb.root, 'cgroup');
      try {
        await new Promise((r) => setTimeout(r, 100));
        const asOwner = { ...env, STUB_REAL_UID: '1', JARVIS_CORE_ALLOW_ROOT: '1', JARVIS_CORE_CGROUP_FILE: cg };
        fs.writeFileSync(cg, '0::/user.slice/user-1000.slice/user@1000.service/app.slice/jarvis-core-autoupdate.service\n');
        let r = install(sb, ['--refresh'], { env: asOwner });
        assert.equal(r.code, 0, r.out);
        assert.match(r.out, /━━ The screen\n  ✓ The dashboard is on the screen; it reloads itself when it sees the new version\n/);
        assert.ok(alive(), 'Chrome was left alone');
        // the same from a terminal in the desktop (a scope, not a service): it reopens the dashboard
        fs.writeFileSync(cg, '0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-org.gnome.Terminal.slice/vte-spawn-1.scope\n');
        r = install(sb, ['--refresh'], { env: asOwner });
        assert.doesNotMatch(r.out, /reloads itself when it sees the new version/);
        assert.match(r.out, /No desktop session found/, 'it went to reopen the screen (no desktop in the sandbox)');
        // the update tick says so explicitly, whatever the cgroup looks like
        r = install(sb, ['--refresh'], { env: { ...asOwner, JARVIS_CORE_UNATTENDED: '1' } });
        assert.match(r.out, /reloads itself when it sees the new version/);
      } finally {
        chrome.kill();
      }
    });

    await t.test('a refresh run by the update timer puts a missing dashboard back on the screen, in a unit of its own', () => {
      // An earlier update (Core 1.0's refresh) reopened Chrome from inside the timer's job, and systemd stopped it
      // with the job: the screen had no dashboard. The next update must bring it back without the owner.
      const marker = path.join(sb.stubs, 'systemd-run-called');
      fs.rmSync(marker, { force: true });
      const asOwner = { ...env, STUB_REAL_UID: '1', JARVIS_CORE_ALLOW_ROOT: '1', JARVIS_CORE_UNATTENDED: '1' };
      // no desktop session known to the user manager: nothing is started, and the screen step says the dashboard
      // isn't there (not "already starts at every login", which reads as if all were well)
      let r = install(sb, ['--refresh'], { env: asOwner });
      assert.equal(r.code, 0, r.out);
      assert.ok(!fs.existsSync(marker), 'no systemd-run without a desktop session');
      assert.match(r.out, /━━ The screen\n  ! The dashboard isn't on the screen: you aren't logged in there right now \(it starts when you log in\)\n/);
      assert.doesNotMatch(r.out, /already starts at every login/);
      // the desktop is up (GNOME exported its display) and no dashboard is on the screen: it comes back
      r = install(sb, ['--refresh'], { env: { ...asOwner, STUB_SHOW_ENV: 'XDG_RUNTIME_DIR=/run/user/1000\nWAYLAND_DISPLAY=wayland-0' } });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /━━ The screen\n  ✓ Put the dashboard back on the screen\n/);
      const log = stubLog(sb);
      const call = (Array.isArray(log) ? log : String(log).split('\n')).filter((l) => l.startsWith('systemd-run ')).pop();
      assert.match(call, /^systemd-run --user --collect --quiet --unit=jarvis-core-screen-\d+ --description=Jarvis Core screen \S+\/jarvis-core screen$/);
      // from a terminal (not the timer), a refresh with no dashboard on the screen starts nothing either
      fs.rmSync(marker, { force: true });
      r = install(sb, ['--refresh'], { env: { ...env, STUB_REAL_UID: '1', JARVIS_CORE_ALLOW_ROOT: '1', JARVIS_CORE_CGROUP_FILE: path.join(sb.root, 'no-such-cgroup'), STUB_SHOW_ENV: 'WAYLAND_DISPLAY=wayland-0' } });
      assert.equal(r.code, 0, r.out);
      assert.ok(!fs.existsSync(marker), 'only the update timer puts it back');
      assert.match(r.out, /━━ The screen\n  ! The dashboard isn't on the screen right now\. Start it: jarvis-core open \(it also starts at every login\)\n/);
    });

    await t.test('uninstall puts everything back and keeps the history', () => {
      const data = path.join(sb.home, '.local/share/jarvis-core');
      fs.mkdirSync(data, { recursive: true });
      fs.writeFileSync(path.join(data, 'events-v1.json'), '[]');
      const r = cli(sb, ['uninstall', '--yes'], { env });
      assert.equal(r.code, 0, r.out);
      assert.ok(!fs.existsSync(unitFile));
      assert.ok(!fs.existsSync(autostart));
      assert.ok(!fs.existsSync(app));
      assert.ok(!fs.existsSync(path.join(sb.home, '.local/bin/jarvis-core')));
      assert.ok(!fs.existsSync(sb.env.JARVIS_CORE_SHIM));
      assert.ok(!fs.existsSync(sb.env.JARVIS_CORE_SUDOERS_FILE));
      assert.ok(!fs.existsSync(stateDir));
      assert.ok(!fs.existsSync(path.join(sb.stubs, 'ts-serving')), 'tailscale serve turned off');
      assert.ok(stubLog(sb).includes(`sudo ${path.join(sb.stubs, 'tailscale')} serve --https=443 off`));
      assert.deepEqual(db(), Object.fromEntries(Object.entries(GSETTINGS_DEFAULTS)), 'screen settings back to what they were');
      assert.match(fs.readFileSync(sb.env.JARVIS_CORE_GDM_CONF, 'utf8'), /\[daemon\]\nAutomaticLoginEnable=false\n/);
      assert.equal(fs.readFileSync(path.join(sb.stubs, 'linger'), 'utf8').trim(), 'no');
      assert.ok(fs.existsSync(path.join(data, 'events-v1.json')), 'history kept without --purge');
      assert.ok(!fs.existsSync(auService) && !fs.existsSync(auTimer), 'the update timer is gone');
      assert.ok(!fs.existsSync(path.join(sb.stubs, 'enabled@jarvis-core-autoupdate.timer')));
      assert.ok(stubLog(sb).includes('systemctl --user disable --now --quiet jarvis-core-autoupdate.timer'));
      assert.match(r.out, /Stopped the automatic updates and removed their timer/);
      assert.match(r.out, /Jarvis Core is uninstalled/);
    });
  } finally {
    stopCore(sb);
    sb.cleanup();
  }
});

test('upgrade from Core 1.0 with a hand-made update timer: its old `jarvis-core update` runs the new refresh', async (t) => {
  // Tonight's path on the Alienware: the owner's timer runs the 1.0 command's update, which hands over to
  // this version's install.sh --refresh, from inside the timer's systemd service.
  const OLD = '916c623'; // main before the brain (Core 1.0)
  const repoRoot = path.resolve(CORE, '..');
  if (spawnSync('git', ['-C', repoRoot, 'cat-file', '-e', `${OLD}^{commit}`]).status !== 0) return t.skip(`commit ${OLD} is not in this clone`);
  const sb = makeSandbox({ tsMode: 'Running', nodeVersion: 'v22.11.0', pkgs: ['git', 'curl', 'lm-sensors', 'smartmontools'] });
  const port = await freePort();
  const work = path.join(sb.root, 'upstream');
  const g = (...a) => execFileSync('git', a, { cwd: work, stdio: 'pipe' }).toString();
  const commit = (msg) => {
    g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A');
    g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', msg);
  };
  const profile = path.join(sb.home, '.local/share/jarvis-core-screen');
  let chrome = null;
  try {
    fs.mkdirSync(work, { recursive: true });
    execFileSync('bash', ['-c', `git -C "$1" archive "$2" core | tar -x -C "$3"`, 'x', repoRoot, OLD, work]);
    fs.rmSync(path.join(work, 'core/dashboard'), { recursive: true, force: true });
    g('init', '-q', '-b', 'main');
    commit('core 1.0');
    g('config', 'uploadpack.allowFilter', 'true');
    g('config', 'uploadpack.allowAnySHA1InWant', 'true');
    const env = { JARVIS_CORE_REPO: `file://${work}`, JARVIS_CORE_PORT: String(port) };
    let r = runScript(sb, path.join(work, 'core/install/install.sh'), [], { answers: ['n', 'n', 'n'], env });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Jarvis Core is running/);
    // the hand-made timer the brief describes
    const units = path.join(sb.home, '.config/systemd/user');
    const script = path.join(sb.home, '.local/bin/jarvis-core-autoupdate');
    fs.writeFileSync(script, '#!/bin/bash\ncd ~/jarvis-core-app && git fetch -q origin main && [ "$(git rev-parse HEAD:core)" != "$(git rev-parse FETCH_HEAD:core)" ] && exec ~/.local/bin/jarvis-core update\n', { mode: 0o755 });
    fs.writeFileSync(path.join(units, 'jarvis-core-autoupdate.service'), '[Service]\nType=oneshot\nExecStart=%h/.local/bin/jarvis-core-autoupdate\n');
    fs.writeFileSync(path.join(units, 'jarvis-core-autoupdate.timer'), '[Timer]\nOnBootSec=5min\nOnUnitActiveSec=20min\n[Install]\nWantedBy=timers.target\n');
    fs.writeFileSync(path.join(sb.stubs, 'enabled@jarvis-core-autoupdate.timer'), '');
    // the merge lands: this working tree's core/
    fs.rmSync(path.join(work, 'core'), { recursive: true, force: true });
    for (const sub of ['server', 'install', 'fixtures', 'package.json', 'package-lock.json', 'whats-new.json', 'README.md']) {
      if (fs.existsSync(path.join(CORE, sub))) fs.cpSync(path.join(CORE, sub), path.join(work, 'core', sub), { recursive: true });
    }
    commit('core with the brain');
    chrome = spawn('bash', ['-c', 'trap "exit 0" TERM; sleep 60 & wait', 'google-chrome-stable', `--user-data-dir=${profile}`], { stdio: 'ignore' });
    const cg = path.join(sb.root, 'cgroup');
    fs.writeFileSync(cg, '0::/user.slice/user-1000.slice/user@1000.service/app.slice/jarvis-core-autoupdate.service\n');
    r = runScript(sb, script, [], { env: { ...env, STUB_REAL_UID: '1', JARVIS_CORE_ALLOW_ROOT: '1', JARVIS_CORE_CGROUP_FILE: cg } });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Installed the brain's libraries/);
    assert.match(r.out, /Took over the update timer you set up by hand/);
    assert.match(r.out, /The dashboard is on the screen; it reloads itself when it sees the new version/);
    assert.ok(fs.readFileSync(path.join(units, 'jarvis-core-autoupdate.service'), 'utf8').includes(`ExecStart="${sb.home}/.local/bin/jarvis-core" autoupdate-tick`));
    assert.ok(!fs.existsSync(script), 'the hand-made script is gone');
    assert.ok(fs.readFileSync(path.join(sb.home, '.local/bin/jarvis-core'), 'utf8').includes('autoupdate-tick'), 'the new command');
    assert.doesNotThrow(() => process.kill(chrome.pid, 0), "the screen's Chrome was left alone");
    const info = await (await fetch(`http://127.0.0.1:${port}/api/info`)).json();
    assert.equal(info.version, JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8')).version);
    // and the next run of the timer is the new tick
    r = cli(sb, ['autoupdate-tick'], { env });
    assert.match(r.out, /Up to date/);
  } finally {
    chrome?.kill();
    stopCore(sb);
    sb.cleanup();
  }
});

test('automatic login edit: replaces old settings in [daemon] only, adds [daemon] when missing', () => {
  const sb = makeSandbox({ tsMode: 'missing', nodeVersion: 'v22.11.0' });
  try {
    // a hand-edited file: old values in [daemon], the same key name in another section
    fs.writeFileSync(sb.env.JARVIS_CORE_GDM_CONF, '[daemon]\nWaylandEnable=false\nAutomaticLoginEnable = False\nAutomaticLogin = someone\n\n[debug]\nAutomaticLogin=keep-me\n');
    const fn = `source <(sed -n '/^gdm_autologin_on()/,/^}/p' "${path.join(path.dirname(CLI), 'install.sh')}"); USER_NAME=frank-wise; GDM_CONF="$1"; gdm_autologin_on`;
    let out = execFileSync('bash', ['-c', fn, 'x', sb.env.JARVIS_CORE_GDM_CONF]).toString();
    assert.equal(out, '[daemon]\nAutomaticLoginEnable=true\nAutomaticLogin=frank-wise\nWaylandEnable=false\n\n[debug]\nAutomaticLogin=keep-me\n');
    fs.writeFileSync(sb.env.JARVIS_CORE_GDM_CONF, '# no sections at all\n');
    out = execFileSync('bash', ['-c', fn, 'x', sb.env.JARVIS_CORE_GDM_CONF]).toString();
    assert.equal(out, '# no sections at all\n\n[daemon]\nAutomaticLoginEnable=true\nAutomaticLogin=frank-wise\n');
    // and the "is it on already" check reads it back
    fs.writeFileSync(sb.env.JARVIS_CORE_GDM_CONF, out);
    const check = `source <(sed -n '/^autologin_is_on()/,/^}/p' "${path.join(path.dirname(CLI), 'install.sh')}"); USER_NAME="$2"; GDM_CONF="$1"; autologin_is_on`;
    assert.doesNotThrow(() => execFileSync('bash', ['-c', check, 'x', sb.env.JARVIS_CORE_GDM_CONF, 'frank-wise']));
    assert.throws(() => execFileSync('bash', ['-c', check, 'x', sb.env.JARVIS_CORE_GDM_CONF, 'someone-else']));
  } finally {
    sb.cleanup();
  }
});

test('jarvis-core refuses root and explains its commands', () => {
  const r = runScript({ env: { PATH: '/usr/bin:/bin', HOME: '/tmp', NO_COLOR: '1' }, root: '/tmp', home: '/tmp' }, CLI, ['help']);
  // the tests run as root in CI containers: the CLI must refuse that
  if (process.getuid?.() === 0) {
    assert.equal(r.code, 1);
    assert.match(r.out, /Run jarvis-core as yourself, without sudo/);
  } else {
    assert.equal(r.code, 0);
    assert.match(r.out, /jarvis-core status/);
  }
});

test('jarvis-core open: starts the screen on its own, and restarts it when it is already up', async () => {
  const sb = makeSandbox({ tsMode: 'missing', nodeVersion: 'v22.11.0' });
  // a stand-in Core that answers /api/ping, so the launcher does not wait (a child process: the
  // tests run the CLI synchronously, which would block a server in this process)
  const corePort = await freePort();
  const core = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => s.end('{"ok":true}')).listen(${corePort}, '127.0.0.1', () => console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => core.stdout.once('data', r));
  const profile = path.join(sb.home, '.local/share/jarvis-core-screen');
  const pattern = `--user-data-dir=${profile}( |$)`;
  const pids = () => (spawnSync('pgrep', ['-f', '--', pattern], { encoding: 'utf8' }).stdout || '').trim().split('\n').filter(Boolean);
  try {
    const bin = path.join(sb.home, '.local/bin/jarvis-core');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.copyFileSync(CLI, bin);
    fs.chmodSync(bin, 0o755);
    // a Chrome stand-in that stays up, like the real one
    fs.writeFileSync(path.join(sb.stubs, 'google-chrome-stable'),
      '#!/bin/bash\necho "google-chrome-stable $*" >> "$STUB_LOG"\n[ "$1" = --version ] && { echo "Google Chrome 142"; exit 0; }\ntrap \'kill $! 2>/dev/null; exit 0\' TERM\nsleep 60 & wait\n', { mode: 0o755 });
    const env = { DISPLAY: ':0', STUB_REAL_UID: '1', JARVIS_CORE_ALLOW_ROOT: '1', JARVIS_CORE_PORT: String(corePort) };
    let r = cli(sb, ['open'], { env });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /The dashboard is opening full screen/);
    const first = pids();
    assert.equal(first.length, 1, 'one Chrome with the screen profile');
    assert.ok(fs.existsSync(path.join(profile, 'Default/Preferences')), 'the profile was marked clean before launch');
    r = cli(sb, ['open'], { env });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Closed the dashboard window/);
    const second = pids();
    assert.equal(second.length, 1, 'still exactly one');
    assert.notEqual(second[0], first[0], 'a fresh Chrome');
    // without a desktop session it says what to do instead of failing obscurely
    r = cli(sb, ['open'], { env: { ...env, DISPLAY: '' } });
    assert.equal(r.code, 1);
    assert.match(r.out, /No desktop session found\. Log in on the computer's screen first/);
  } finally {
    for (const pid of pids()) {
      try { process.kill(Number(pid), 'SIGTERM'); } catch {}
    }
    core.kill();
    sb.cleanup();
  }
});

test('the Tailscale steps it prints use wget, which a fresh Ubuntu desktop has (curl may be missing)', async () => {
  for (const f of ['install.sh', 'jarvis-core']) {
    const text = fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
    assert.ok(text.includes('wget -qO- https://tailscale.com/install.sh | sh'), `${f} prints the wget form`);
    assert.ok(!text.includes('curl -fsSL https://tailscale.com/install.sh'), `${f} never prints the curl form`);
  }
});
