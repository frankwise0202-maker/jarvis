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
  GSETTINGS_DEFAULTS, GDM_STOCK, USER,
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
    assert.match(o, /1 of 12 · Checking this computer/);
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
    // automatic login, Tailscale's three commands, the final box
    assert.match(o, /set AutomaticLoginEnable=true and AutomaticLogin=frank-wise in the \[daemon\] section/);
    assert.match(o, /curl -fsSL https:\/\/tailscale\.com\/install\.sh \| sh\n.*sudo tailscale up\n.*sudo tailscale serve --bg 8788/);
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
    const r = install(sb, ['--dry-run'], { answers: ['n', 'n'] });
    assert.equal(r.code, 0, r.out);
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
  const db = () => Object.fromEntries(fs.readFileSync(path.join(sb.stubs, 'gsettings.db'), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  try {
    await t.test('first install: answers yes, yes, yes', () => {
      const r = install(sb, [], { answers: ['y', 'y', 'y'], env });
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
      assert.match(r.out, /Jarvis Core is uninstalled/);
    });
  } finally {
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
