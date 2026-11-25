// Configuration: built-in defaults, then the optional file ~/.config/jarvis-core/config.json, then
// environment variables, then command-line flags. A bad config file never stops the Core: it is reported
// and the defaults are used. The Core only ever listens on this computer (a loopback address).
//
// Environment                      Flag                 Meaning
//   JARVIS_CORE_PORT               --port N             port on 127.0.0.1 (default 8788; 0 = any free port)
//   JARVIS_CORE_HOST               --host H             127.0.0.1 (default), ::1 or localhost only
//   JARVIS_CORE_DATA_DIR           --data-dir D         where history and events are saved
//   JARVIS_CORE_NO_PERSIST=1       --no-persist         keep everything in memory only
//   JARVIS_CORE_DASHBOARD_DIR      --dashboard-dir D    static files served at / (default core/dashboard)
//   JARVIS_CORE_OWNER              --owner NAME         how the status assistant addresses you (default Frank)
//   JARVIS_CORE_LOCALE             --locale TAG         times and dates, e.g. en-GB for 16:47 (default: the system's)
//   JARVIS_CORE_NIGHT              --night 23:00-07:00  night dim window for the dashboard, or "off"
//   JARVIS_CORE_FIXTURE            --fixture NAME       simulated machine: ok | warn | alert | nogpu | offline
//   JARVIS_CORE_TIME_SCALE         --time-scale N       fixture only: simulated seconds per real second
//   JARVIS_CORE_START              --start ISO          fixture only: the simulated "now" at start
//   JARVIS_CORE_SEED               --seed N             fixture only: noise seed (default 1)
//   JARVIS_CORE_CONFIG             --config FILE        config file path

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { deepMerge, isObj, parseHm } from './util.mjs';
import { defaultDataDir } from './store.mjs';
import { SCENARIO_NAMES } from './sim/scenarios.mjs';
import { resolveLocale, systemLocale } from './format.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CORE_DIR = path.resolve(HERE, '..');

export const SITE_ORIGIN = 'https://frankwise0202-maker.github.io';

export const DEFAULTS = Object.freeze({
  ownerName: 'Frank',
  locale: null, // times and dates: the system's ("en-US": 4:47 PM), or e.g. "en-GB" (16:47)
  host: '127.0.0.1',
  port: 8788,
  dataDir: null,
  persist: true,
  dashboardDir: path.join(CORE_DIR, 'dashboard'),
  night: { enabled: true, start: '23:00', end: '07:00' },
  siteUrl: `${SITE_ORIGIN}/jarvis/`,
  siteSwUrl: `${SITE_ORIGIN}/jarvis/sw.js`,
  apiUrl: 'https://api.anthropic.com/',
  internetUrls: ['https://1.1.1.1/', 'https://8.8.8.8/'],
  dnsHost: 'one.one.one.one',
  allowedOrigins: [SITE_ORIGIN],
  tailscaleLogins: [],
  intervals: {
    tickMs: 1000,
    processesMs: 2000,
    gpuMs: 2000,
    gpuTimeoutMs: 1500,
    disksMs: 10_000,
    servicesMs: 30_000,
    serveMs: 300_000,
    smartMs: 6 * 3600_000,
    saveMs: 5 * 60_000,
    eventsSaveDelayMs: 10_000,
    statusEveryMs: 30_000,
  },
  thresholds: {},
  gpuMissingLevel: 'warn',
  smartSudo: true,
  limits: {
    askBodyBytes: 4096,
    questionChars: 300,
    askPerMinute: 30,
    askBurst: 8,
    apiPerSecond: 20,
    apiBurst: 60,
    sseClients: 16,
    eventsMax: 1000,
  },
  fixture: null,
  timeScale: 1,
  startMs: null,
  seed: 1,
  once: false,
});

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

const FLAG_MAP = {
  '--port': 'port',
  '--host': 'host',
  '--data-dir': 'dataDir',
  '--dashboard-dir': 'dashboardDir',
  '--owner': 'ownerName',
  '--locale': 'locale',
  '--night': 'night',
  '--fixture': 'fixture',
  '--time-scale': 'timeScale',
  '--start': 'start',
  '--seed': 'seed',
  '--config': 'configFile',
};

/** Parse command-line flags ("--port 9000" or "--port=9000"). Unknown flags are reported. */
export function parseArgs(argv = []) {
  const out = { flags: {}, unknown: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--once') out.flags.once = true;
    else if (a === '--no-persist') out.flags.noPersist = true;
    else if (a === '--help' || a === '-h') out.flags.help = true;
    else if (a === '--version' || a === '-v') out.flags.version = true;
    else {
      const [name, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
      const key = FLAG_MAP[name];
      if (!key) {
        out.unknown.push(a);
        continue;
      }
      const value = inline ?? argv[i + 1];
      if (inline === null) i += 1;
      out.flags[key] = value;
    }
  }
  return out;
}

function parseNight(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (isObj(v)) return v;
  const s = String(v).trim().toLowerCase();
  if (s === 'off' || s === 'false' || s === 'none') return { enabled: false };
  const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(s);
  return m ? { enabled: true, start: m[1], end: m[2] } : { invalid: String(v) };
}

/**
 * Build the configuration. Returns { config, warnings, errors, help, version }. `errors` are fatal
 * (e.g. a non-loopback host); warnings are printed and ignored.
 */
export function loadConfig({ env = process.env, argv = [], readFile = (p) => fs.readFileSync(p, 'utf8') } = {}) {
  const warnings = [];
  const errors = [];
  const { flags, unknown } = parseArgs(argv);
  for (const u of unknown) warnings.push(`unknown option ${u} (ignored)`);

  // 1. config file
  const configFile = flags.configFile ?? env.JARVIS_CORE_CONFIG ?? path.join(env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(os.homedir(), '.config'), 'jarvis-core', 'config.json');
  let fileCfg = {};
  try {
    const text = readFile(configFile);
    const parsed = JSON.parse(text);
    if (isObj(parsed)) fileCfg = parsed;
    else warnings.push(`${configFile} is not a JSON object (ignored)`);
  } catch (err) {
    if (err?.code !== 'ENOENT') warnings.push(`could not read ${configFile}: ${err?.message ?? err} (using defaults)`);
  }
  const allowedFileKeys = new Set(['ownerName', 'locale', 'port', 'dataDir', 'dashboardDir', 'night', 'allowedOrigins', 'tailscaleLogins', 'thresholds', 'gpuMissingLevel', 'smartSudo', 'limits', 'intervals', 'siteUrl', 'siteSwUrl', 'apiUrl', 'internetUrls', 'dnsHost', 'persist']);
  for (const k of Object.keys(fileCfg)) {
    if (!allowedFileKeys.has(k)) {
      warnings.push(`config file key "${k}" is not supported (ignored)`);
      delete fileCfg[k];
    }
  }
  let cfg = deepMerge(structuredClone(DEFAULTS), fileCfg);

  // 2. environment, 3. flags (flags win)
  const pick = (flag, envName) => (flags[flag] !== undefined ? flags[flag] : env[envName] !== undefined && env[envName] !== '' ? env[envName] : undefined);
  const over = {
    port: pick('port', 'JARVIS_CORE_PORT'),
    host: pick('host', 'JARVIS_CORE_HOST'),
    dataDir: pick('dataDir', 'JARVIS_CORE_DATA_DIR'),
    dashboardDir: pick('dashboardDir', 'JARVIS_CORE_DASHBOARD_DIR'),
    ownerName: pick('ownerName', 'JARVIS_CORE_OWNER'),
    locale: pick('locale', 'JARVIS_CORE_LOCALE'),
    night: parseNight(pick('night', 'JARVIS_CORE_NIGHT')),
    fixture: pick('fixture', 'JARVIS_CORE_FIXTURE'),
    timeScale: pick('timeScale', 'JARVIS_CORE_TIME_SCALE'),
    start: pick('start', 'JARVIS_CORE_START'),
    seed: pick('seed', 'JARVIS_CORE_SEED'),
  };
  if (over.port !== undefined) cfg.port = Number(over.port);
  if (over.host !== undefined) cfg.host = String(over.host);
  if (over.dataDir !== undefined) cfg.dataDir = path.resolve(String(over.dataDir));
  if (over.dashboardDir !== undefined) cfg.dashboardDir = path.resolve(String(over.dashboardDir));
  if (over.ownerName !== undefined) cfg.ownerName = String(over.ownerName).trim().slice(0, 40);
  if (over.locale !== undefined) cfg.locale = String(over.locale);
  if (over.night?.invalid) warnings.push(`night window "${over.night.invalid}" should look like 23:00-07:00 (ignored)`);
  else if (over.night) cfg.night = { ...cfg.night, ...over.night };
  if (over.fixture !== undefined) cfg.fixture = String(over.fixture).trim().toLowerCase() || null;
  if (over.timeScale !== undefined) cfg.timeScale = Number(over.timeScale);
  if (over.seed !== undefined) cfg.seed = Number(over.seed);
  if (over.start !== undefined) {
    const ms = Date.parse(String(over.start));
    if (Number.isFinite(ms)) cfg.startMs = ms;
    else warnings.push(`start time "${over.start}" is not a date (ignored)`);
  }
  if (flags.once) cfg.once = true;
  if (flags.noPersist || env.JARVIS_CORE_NO_PERSIST === '1') cfg.persist = false;

  // Validation
  if (!LOOPBACK.has(cfg.host)) {
    errors.push(`host "${cfg.host}" is not allowed: Jarvis Core only listens on this computer (127.0.0.1). Use Tailscale serve to reach it from other devices.`);
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) errors.push(`port "${cfg.port}" is not a valid port number`);
  if (cfg.fixture !== null && !SCENARIO_NAMES.includes(cfg.fixture)) errors.push(`fixture "${cfg.fixture}" is not one of ${SCENARIO_NAMES.join(', ')}`);
  if (!Number.isFinite(cfg.timeScale) || cfg.timeScale <= 0) {
    warnings.push(`time scale "${cfg.timeScale}" is not a positive number (using 1)`);
    cfg.timeScale = 1;
  }
  if (cfg.timeScale !== 1 && !cfg.fixture) {
    warnings.push('time scale only applies to fixture mode (ignored)');
    cfg.timeScale = 1;
  }
  cfg.timeScale = Math.min(cfg.timeScale, 3600);
  if (!Number.isInteger(cfg.seed)) cfg.seed = 1;
  for (const k of ['start', 'end']) {
    if (cfg.night[k] !== undefined && parseHm(cfg.night[k]) === null) {
      warnings.push(`night ${k} "${cfg.night[k]}" should be HH:MM (using ${DEFAULTS.night[k]})`);
      cfg.night[k] = DEFAULTS.night[k];
    }
  }
  if (!['ok', 'warn', 'alert'].includes(cfg.gpuMissingLevel)) cfg.gpuMissingLevel = 'warn';
  if (!Array.isArray(cfg.allowedOrigins)) cfg.allowedOrigins = [...DEFAULTS.allowedOrigins];
  cfg.allowedOrigins = cfg.allowedOrigins.filter((o) => typeof o === 'string' && /^https?:\/\/[^/]+$/.test(o));
  if (!Array.isArray(cfg.tailscaleLogins)) cfg.tailscaleLogins = [];
  if (!cfg.ownerName) cfg.ownerName = null;
  if (cfg.locale !== null && cfg.locale !== undefined && cfg.locale !== '') {
    const l = resolveLocale(String(cfg.locale));
    if (!l) warnings.push(`locale "${cfg.locale}" is not one I know (using the system's)`);
    cfg.locale = l ?? resolveLocale(systemLocale()) ?? 'en-US';
  } else cfg.locale = resolveLocale(systemLocale()) ?? 'en-US';

  // Fixture mode keeps its history in memory unless a data directory was asked for explicitly.
  if (cfg.fixture && over.dataDir === undefined && fileCfg.dataDir === undefined) cfg.persist = false;
  if (!cfg.dataDir) cfg.dataDir = defaultDataDir(env);

  return { config: cfg, warnings, errors, help: !!flags.help, version: !!flags.version, configFile };
}

export const USAGE = `jarvis-core: the home base's 24/7 system report.

Usage: node core/server/main.mjs [options]

  --port N             port on 127.0.0.1 (default 8788)
  --fixture NAME       run on a simulated machine: ok | warn | alert | nogpu | offline
  --time-scale N       fixture only: simulated seconds per real second (e.g. 60)
  --start ISO          fixture only: the simulated time at start (e.g. 2026-11-25T14:32:00)
  --data-dir DIR       where history and events are saved (default ~/.local/share/jarvis-core)
  --no-persist         keep history and events in memory only
  --dashboard-dir DIR  static files served at / (default core/dashboard)
  --owner NAME         how the status assistant addresses you (default Frank)
  --locale TAG         times and dates, e.g. en-GB for 16:47 (default: the system's)
  --night HH:MM-HH:MM  night dim window for the dashboard, or "off" (default 23:00-07:00)
  --once               print one full report as JSON and exit
  --version            print the version
  --help               this help

Environment variables JARVIS_CORE_PORT, JARVIS_CORE_FIXTURE, JARVIS_CORE_TIME_SCALE, JARVIS_CORE_START,
JARVIS_CORE_DATA_DIR, JARVIS_CORE_DASHBOARD_DIR, JARVIS_CORE_OWNER and JARVIS_CORE_NIGHT do the same.
Optional settings file: ~/.config/jarvis-core/config.json
`;
