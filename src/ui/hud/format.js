// HUD formatting helpers. Pure functions (no DOM), plus one shared once-per-second ticker that
// drives every live elapsed timer, so twenty running agent cards cost a single interval.

const ACTIVE = new Set(['starting', 'thinking', 'searching', 'reading', 'writing', 'running', 'planning', 'listening', 'working', 'speaking']);
const FINISHED = new Set(['done', 'error', 'stopped', 'interrupted', 'partial']);

const LABELS = {
  // core states
  idle: 'Idle',
  listening: 'Listening',
  working: 'Working',
  speaking: 'Speaking',
  offline: 'Offline',
  // agent statuses
  queued: 'Queued',
  starting: 'Starting',
  thinking: 'Thinking',
  searching: 'Searching',
  reading: 'Reading',
  writing: 'Writing',
  done: 'Done',
  error: 'Error',
  stopped: 'Stopped',
  interrupted: 'Interrupted',
  // mission / turn statuses
  planning: 'Planning',
  running: 'Running',
  partial: 'Partial',
};

const TONES = {
  idle: 'idle',
  offline: 'idle',
  queued: 'idle',
  done: 'ok',
  partial: 'warn',
  stopped: 'warn',
  interrupted: 'warn',
  error: 'err',
};

const ICONS = {
  idle: 'dot',
  listening: 'mic',
  working: 'agents',
  speaking: 'speaker',
  offline: 'wifi-off',
  queued: 'clock',
  starting: 'bolt',
  thinking: 'sparkle',
  searching: 'search',
  reading: 'globe',
  writing: 'edit',
  done: 'check',
  error: 'alert',
  stopped: 'stop',
  interrupted: 'pause',
  planning: 'layers',
  running: 'agents',
  partial: 'alert',
};

const pad2 = (n) => (n < 10 ? '0' : '') + n;

/** "0s", "42s", "1m 05s", "2h 03m", "3d 4h". Negative, missing or non-finite input reads as "0s". */
export function fmtDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 1000) return '0s';
  const total = Math.floor(n / 1000);
  if (total < 60) return `${total}s`;
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const hr = Math.floor(total / 3600);
  if (hr === 0) return `${m}m ${pad2(s)}s`;
  if (hr < 24) return `${hr}h ${pad2(m)}m`;
  return `${Math.floor(hr / 24)}d ${hr % 24}h`;
}

/** Cost estimate: "≈ $0.42", "< $0.01" for tiny amounts, "$0.00" for nothing yet, "≈ $1,234" past $1,000. */
export function fmtUsd(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return '$0.00';
  if (n < 0.01) return '< $0.01';
  if (n < 1000) return `≈ $${n.toFixed(2)}`;
  return `≈ $${groupDigits(Math.round(n))}`;
}

/** Compact count: "7", "1,234", "12.3K", "4.5M". */
export function fmtCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  const sign = v < 0 ? '-' : '';
  let a = Math.abs(v);
  if (Math.round(a) < 10000) return sign + groupDigits(Math.round(a));
  const units = ['K', 'M', 'B', 'T'];
  let u = -1;
  while (u < units.length - 1 && a >= 999.95) {
    a /= 1000;
    u += 1;
  }
  const digits = a < 100 ? a.toFixed(1).replace(/\.0$/, '') : String(Math.round(a));
  return sign + digits + units[u];
}

function groupDigits(int) {
  return String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Human label for any agent / mission / turn / core status.
 * `kind` refines wording: a finished mission reads "Complete", a failed agent "Failed".
 */
export function statusLabel(status, kind) {
  if (kind === 'mission' && status === 'done') return 'Complete';
  if (kind === 'agent' && status === 'error') return 'Failed';
  const label = LABELS[status];
  if (label) return label;
  const s = String(status || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown';
}

/** Visual tone for a status: 'idle' | 'active' | 'ok' | 'warn' | 'err'. */
export function statusTone(status) {
  return TONES[status] || (ACTIVE.has(status) ? 'active' : 'idle');
}

/** Icon name (src/ui/icons.js) that represents a status, so status is never shown by color alone. */
export function statusIcon(status) {
  return ICONS[status] || 'dot';
}

/** True while an agent / mission / turn is doing work (including 'planning'; 'queued' is not active). */
export function isActiveStatus(status) {
  return ACTIVE.has(status);
}

/** True once an agent / mission / turn has reached a final state. */
export function isFinishedStatus(status) {
  return FINISHED.has(status);
}

/** "example.com" for "https://www.example.com/a?b" ('' when the URL cannot be parsed). */
export function hostname(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/** Elapsed ms between `startedAt` and `endedAt` (or `now` while running); null when not started. */
export function elapsedMs(startedAt, endedAt, now = Date.now()) {
  const start = Number(startedAt);
  if (!Number.isFinite(start) || start <= 0) return null;
  const endRaw = Number(endedAt);
  const end = Number.isFinite(endRaw) && endRaw > 0 ? endRaw : now;
  return Math.max(0, end - start);
}

/** Live-timer text: "1m 05s", or "—" when the clock has not started. */
export function fmtElapsed(startedAt, endedAt, now) {
  const ms = elapsedMs(startedAt, endedAt, now);
  return ms === null ? '—' : fmtDuration(ms);
}

/** "claude-sonnet-5-5" → "Sonnet 5.5"; unknown ids are returned unchanged. */
export function modelShort(model) {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/i.exec(String(model || ''));
  if (!m) return String(model || '');
  return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}.${m[3]}`;
}

/** "1 source" / "3 sources" (pass `many` for irregular plurals). */
export function plural(n, one, many = `${one}s`) {
  return `${fmtCount(n)} ${Number(n) === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------------------------
// Shared 1-second ticker. Subscribers run on whole-second boundaries so every visible timer
// flips together. The underlying timer only exists while someone is subscribed.

const secondSubs = new Set();
let secondTimer = 0;

function scheduleSecond() {
  secondTimer = setTimeout(tickSecond, 1000 - (Date.now() % 1000) + 5);
}

function tickSecond() {
  secondTimer = 0;
  const now = Date.now();
  for (const fn of Array.from(secondSubs)) {
    try {
      fn(now);
    } catch (err) {
      console.error('[hud] timer callback failed', err);
    }
  }
  if (secondSubs.size) scheduleSecond();
}

/** Call fn(nowMs) once per second until the returned unsubscribe function is called. */
export function onSecond(fn) {
  if (typeof fn !== 'function') return () => {};
  secondSubs.add(fn);
  if (!secondTimer) scheduleSecond();
  return () => {
    secondSubs.delete(fn);
    if (!secondSubs.size && secondTimer) {
      clearTimeout(secondTimer);
      secondTimer = 0;
    }
  };
}
