// Home base (v7.5, SPEC §23): the Jarvis Core, the owner's always-on Alienware, reached over
// Tailscale (`tailscale serve`: https://<machine>.<tailnet>.ts.net/). Pure helpers: no DOM, no
// network, no storage.
//
//   normalizeHomeBaseUrl(text)    -> { ok: true, url: 'https://<host>.ts.net/' } | { ok: false, error, message }
//   isHomeBaseUrl(url)            -> true for an address normalizeHomeBaseUrl() made (what Settings store)
//   homeBaseApi(base, path)       -> 'https://<host>.ts.net/api/<path>'
//   homeBaseView(status)          -> what the tile shows, from GET /api/status (null: not a Core's status)
//   failureState(failure)         -> { phase, message } for a request that failed (unreachable, refused, ...)
//   matchHomeBaseCommand(text)    -> true for "how's the home base" / "home base status" (the whole sentence)
//   createPoller({ run, intervalMs }) -> the polling lifecycle (every 30 s, only while visible)
//
// The tile never invents a number: a value the Core doesn't report (null, missing, a GPU without its
// driver) is shown as unknown, never as 0.

export const HOME_BASE_EXAMPLE = 'https://alienware.tail1234.ts.net/';
export const POLL_MS = 30000;
export const ASK_MAX_CHARS = 300; // the Core's question limit (handoff §7)

export const UNREACHABLE_MESSAGE = 'Can’t reach the home base. Is Tailscale on on this device?';
export const REFUSED_MESSAGE = 'The home base refused the connection. Open Jarvis from its usual address, on a device signed in to your Tailscale.';
export const UNSET_MESSAGE = 'Link your Jarvis Core to see how it’s doing here.';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** One line of plain text from the Core (control characters and runs of spaces removed). */
export function cleanLine(value, max = 200) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ---- the address ---------------------------------------------------------------------------------

const fail = (error, message) => ({ ok: false, error, message });

/**
 * The home base's address as the owner pastes it, with or without https://, a trailing slash or a
 * path ("https://alienware.tail1234.ts.net/api/status"), becomes 'https://alienware.tail1234.ts.net/'.
 * Only https, only a Tailscale name (<machine>.<tailnet>.ts.net), no user name or password, no port
 * other than 443 (the app's Content-Security-Policy allows https://*.ts.net on 443 only).
 */
export function normalizeHomeBaseUrl(input) {
  let text = typeof input === 'string' ? input.trim() : '';
  if (!text) return fail('empty', 'Paste your home base’s address first.');
  if (text.length > 512) return fail('invalid', 'That address is too long.');
  if (/\s/.test(text)) return fail('invalid', `That isn’t a web address. It looks like ${HOME_BASE_EXAMPLE}`);
  // Pasted without a scheme ("alienware.tail1234.ts.net").
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text.replace(/^\/+/, '')}`;
  let u;
  try {
    u = new URL(text);
  } catch {
    return fail('invalid', `That isn’t a web address. It looks like ${HOME_BASE_EXAMPLE}`);
  }
  if (u.protocol === 'http:') return fail('http', 'Use the https:// address: Tailscale serve gives your home base a secure one.');
  if (u.protocol !== 'https:') return fail('invalid', `That isn’t a web address. It looks like ${HOME_BASE_EXAMPLE}`);
  if (u.username || u.password) return fail('invalid', 'Leave out any user name or password: just the address.');
  let host = u.hostname.toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (!host.endsWith('.ts.net')) return fail('host', 'The address must end in .ts.net: your home base’s Tailscale name.');
  const labels = host.split('.');
  if (labels.length < 4 || host.length > 253 || !labels.every((l) => LABEL.test(l))) {
    return fail('host', `That isn’t a Tailscale machine name. It looks like ${HOME_BASE_EXAMPLE}`);
  }
  if (u.port && u.port !== '443') return fail('port', 'Use the address without a port: Tailscale serve answers on the normal https port.');
  return { ok: true, url: `https://${host}/` };
}

/** True for a stored address: exactly what normalizeHomeBaseUrl() returns. */
export function isHomeBaseUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  const r = normalizeHomeBaseUrl(url);
  return r.ok && r.url === url;
}

/** 'https://host.ts.net/' + 'status' -> 'https://host.ts.net/api/status'. */
export function homeBaseApi(base, path) {
  return `${base}api/${String(path).replace(/^\/+/, '')}`;
}

/** The machine part of a stored address ("alienware"), for labels. */
export function homeBaseName(url) {
  const r = typeof url === 'string' && url ? normalizeHomeBaseUrl(url) : null;
  return r && r.ok ? r.url.slice('https://'.length).split('.')[0] : '';
}

// ---- what the tile shows ------------------------------------------------------------------------

export const LEVEL_WORDS = Object.freeze({ ok: 'OK', warn: 'WARNING', alert: 'ALERT', unknown: 'UNKNOWN' });

/** Decimal bytes, as disks are sold ("492 GB", "1.2 TB", "35 GB"). */
export function formatBytes(bytes) {
  const b = num(bytes);
  if (b === null || b < 0) return null;
  const units = [
    [1e12, 'TB'],
    [1e9, 'GB'],
    [1e6, 'MB'],
    [1e3, 'KB'],
  ];
  for (const [size, unit] of units) {
    if (b >= size) {
      const v = b / size;
      return `${v < 10 ? Math.round(v * 10) / 10 : Math.round(v)} ${unit}`;
    }
  }
  return `${Math.round(b)} B`;
}

const pct = (v) => {
  const n = num(v);
  return n === null || n < 0 ? null : `${Math.round(Math.min(100, n))}%`;
};

/** The GPU cell: its temperature, or why there is none ("driver not loaded"). Never a made-up number. */
export function gpuReading(gpu) {
  if (!isObj(gpu)) return null;
  const status = typeof gpu.status === 'string' ? gpu.status : '';
  if (status === 'ok' && gpu.available !== false) {
    const t = num(gpu.tempC);
    return t === null ? null : `${Math.round(t)} °C`;
  }
  if (status === 'not-installed' || status === 'driver-not-loaded') return 'driver not loaded';
  if (status === 'pending') return 'checking';
  if (status === 'no-device') return 'no NVIDIA card';
  if (status === 'error') return 'not answering';
  const msg = cleanLine(gpu.message, 40);
  return msg ? msg.toLowerCase() : null;
}

/** The main drive: "/" (the Core lists it first), else the first real filesystem. */
function mainMount(disks) {
  const mounts = isObj(disks) && Array.isArray(disks.mounts) ? disks.mounts.filter(isObj) : [];
  return mounts.find((m) => m.mount === '/') || mounts[0] || null;
}

/**
 * GET /api/status -> { level, word, summary, host, version, cpu, gpu, ram, disk, t } (strings; null
 * where the Core reports nothing) or null when the answer isn't a Jarvis Core status (v: 1, health).
 */
export function homeBaseView(status) {
  if (!isObj(status) || status.v !== 1 || !isObj(status.health)) return null;
  const health = status.health;
  const level = ['ok', 'warn', 'alert'].includes(health.level) ? health.level : 'unknown';
  const disk = mainMount(status.disks);
  const free = disk ? formatBytes(disk.freeBytes) : null;
  return {
    level,
    word: LEVEL_WORDS[level],
    summary: cleanLine(health.summary, 220),
    host: cleanLine(isObj(status.host) ? status.host.hostname : '', 64),
    version: cleanLine(isObj(status.core) ? status.core.version : '', 24),
    cpu: pct(isObj(status.cpu) ? status.cpu.usagePct : null),
    gpu: gpuReading(status.gpu),
    ram: pct(isObj(status.memory) ? status.memory.usedPct : null),
    disk: free,
    t: num(status.t),
  };
}

/**
 * A failed request (platform/homebase.js) -> { phase, message }:
 *   unreachable   no answer (Tailscale off, the machine asleep, a timeout)
 *   refused       an answer this page may not read (CORS) or 403
 *   starting      503 while the Core starts
 *   notcore       an answer that isn't a Jarvis Core's
 *   error         any other HTTP error (429 included)
 */
export function failureState(failure) {
  const f = isObj(failure) ? failure : {};
  const detail = cleanLine(f.message, 160);
  switch (f.kind) {
    case 'unreachable':
      return { phase: 'unreachable', message: UNREACHABLE_MESSAGE };
    case 'refused':
      return { phase: 'refused', message: detail ? `${REFUSED_MESSAGE} (It said: ${detail})` : REFUSED_MESSAGE };
    case 'starting':
      return { phase: 'starting', message: 'The home base is starting up. Trying again shortly.' };
    case 'notcore':
      return { phase: 'error', message: 'That address answered, but it isn’t a Jarvis Core. Check the address in Settings → Home base.' };
    case 'rate':
      return { phase: 'error', message: detail ? `The home base asked to slow down: ${detail}` : 'The home base asked to slow down. Try again in a moment.' };
    default: {
      const code = num(f.status);
      return { phase: 'error', message: `The home base answered with an error${code ? ` (${code})` : ''}${detail ? `: ${detail}` : '.'}` };
    }
  }
}

// ---- "how's the home base" ------------------------------------------------------------------------

const HOME = '(?:home ?base|home-base|jarvis core)';
const OWN = '(?:the |my |our )?';
const COMMANDS = [
  new RegExp(`^(?:hows|how is|how are things at|how are things with|hows it going at|hows it going with|hows everything at|how is everything at) ${OWN}${HOME}(?: doing| holding up| looking)?$`),
  new RegExp(`^${OWN}${HOME} (?:status|status report|report|check|health|health check)$`),
  new RegExp(`^(?:whats|what is) ${OWN}${HOME} status$`),
  new RegExp(`^(?:(?:give me|get me|show me|whats|what is) )?(?:the )?(?:status|report|status report) (?:of|on|from|for) ${OWN}${HOME}$`),
  new RegExp(`^(?:check|check on|ping) ${OWN}${HOME}$`),
  new RegExp(`^is ${OWN}${HOME} (?:ok|okay|alright|all right|fine|good|up|online|running|working)$`),
];

/**
 * "How's the home base?", "home base status", "status of my home base", "is the home base ok?",
 * "Jarvis Core status": the whole sentence (with "Jarvis," before it or "please" after it), so a
 * longer request that merely mentions the home base still goes to Claude.
 */
export function matchHomeBaseCommand(text) {
  if (typeof text !== 'string' || text.length > 120) return false;
  let s = text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/[^a-z0-9' -]+/g, ' ')
    .replace(/'/g, '') // how's -> hows, what's -> whats
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^(?:hey |ok |okay )?jarvis (?!core\b)/, '').replace(/ (?:please|jarvis|thanks|thank you)$/, '').trim();
  return COMMANDS.some((re) => re.test(s));
}

// ---- polling -------------------------------------------------------------------------------------

/**
 * The polling lifecycle: run() every intervalMs while active (the tile and the page are visible, and
 * an address is set), never two at once. Becoming active polls at once when the last poll is older
 * than the interval (or there was none), otherwise when the interval since the last one is up.
 * Inactive: no timer runs (a poll in flight finishes but schedules nothing).
 *
 *   const p = createPoller({ run, intervalMs, now, setTimer, clearTimer });
 *   p.setActive(bool) · p.poke() (poll now, if active) · p.destroy() · p.state() (tests)
 */
export function createPoller({ run, intervalMs = POLL_MS, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  let active = false;
  let timer = null;
  let inFlight = false;
  let lastAt = null; // when the last poll started
  let destroyed = false;
  let again = false; // poke() during a poll: poll once more when it ends

  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function schedule(ms) {
    cancel();
    if (!active || destroyed) return;
    timer = setTimer(() => {
      timer = null;
      tick();
    }, Math.max(0, ms));
  }

  async function tick() {
    if (!active || destroyed || inFlight) return;
    inFlight = true;
    lastAt = now();
    try {
      await run();
    } catch {
      /* run() reports its own failures */
    } finally {
      inFlight = false;
    }
    if (again) {
      again = false;
      schedule(0);
    } else schedule(intervalMs);
  }

  return {
    setActive(next) {
      const on = !!next && !destroyed;
      if (on === active) return;
      active = on;
      if (!active) {
        cancel();
        again = false;
        return;
      }
      if (inFlight) return; // it schedules the next one when it ends
      const due = lastAt === null ? 0 : lastAt + intervalMs - now();
      schedule(due);
    },
    poke() {
      if (!active || destroyed) return;
      if (inFlight) {
        again = true;
        return;
      }
      schedule(0);
    },
    destroy() {
      destroyed = true;
      active = false;
      cancel();
    },
    state: () => ({ active, inFlight, scheduled: timer !== null, lastAt }),
  };
}
