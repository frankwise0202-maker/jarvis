// The dashboard's link to the Core: a first full read (/api/info, /api/status, /api/history,
// /api/events), then the live stream (/api/stream, Server-Sent Events). The Core sends named
// frames: `status` (the full snapshot, on connect, on any health or service change and every
// 30 s), `tick` (the compact snapshot, every second), `event` (a new event-log entry, with its id
// so a reconnecting EventSource gets what it missed) and `info`. The browser's own EventSource
// retry is not enough for weeks of uptime (it gives up on an HTTP error and never notices a stream
// that goes silent), so this keeps its own watchdog and reconnects with backoff. Every URL is
// relative, so the page works at / on localhost and behind `tailscale serve`.

const STALE_MS = 5000; // no snapshot for this long: the Core counts as offline
// Silence is measured on the monotonic clock: a wall-clock step (NTP, a time zone change) must
// never make the Core look offline, nor hide a real outage.
const monoNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
const EVENTS_EVERY_MS = 15000;
const FETCH_TIMEOUT_MS = 6000;

async function getJson(url, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{
 *   onStatus: (raw: object) => void,          a full status (replaces the merged state)
 *   onSnapshot: (raw: object) => void,        a compact stream snapshot (merged into the state)
 *   onInfo: (info: object) => void,
 *   onHistory: (body: object) => void,
 *   onEvents: (body: object) => void,         the events body, or one pushed event
 *   onLink: (online: boolean) => void,        the link went up / down
 *   fetchImpl?: typeof fetch, EventSourceImpl?: typeof EventSource, base?: string,
 *   monoNow?: () => number,                    a monotonic clock in ms (tests)
 * }} hooks
 */
export function createClient(hooks) {
  const base = hooks.base || '';
  const mono = hooks.monoNow || monoNow;
  const fetchImpl = hooks.fetchImpl || ((...a) => fetch(...a));
  const ES = hooks.EventSourceImpl || (typeof EventSource === 'function' ? EventSource : null);
  let es = null;
  let online = false;
  let lastMessage = 0; // monotonic
  let lastMessageWall = 0;
  let attempt = 0;
  let reconnectTimer = 0;
  let watchdog = 0;
  let eventsTimer = 0;
  let stopped = false;
  let messages = 0;
  let reconnects = 0;
  let openedAt = 0; // when the current stream was opened (a silent stream is replaced)
  let everConnected = false;

  function setOnline(v) {
    if (v === online) return;
    online = v;
    hooks.onLink(v);
  }

  async function fullRead() {
    const results = await Promise.allSettled([
      getJson(`${base}api/info`, fetchImpl).then((b) => hooks.onInfo(b)),
      getJson(`${base}api/status`, fetchImpl).then((b) => hooks.onStatus(b)),
      getJson(`${base}api/history?range=15m&series=cpu,gpu,ram,netRx,netTx`, fetchImpl).then((b) => hooks.onHistory(b)),
      getJson(`${base}api/events?limit=40`, fetchImpl).then((b) => hooks.onEvents(b)),
    ]);
    return results[1].status === 'fulfilled';
  }

  async function pollEvents() {
    if (stopped) return;
    try {
      if (online) hooks.onEvents(await getJson(`${base}api/events?limit=20`, fetchImpl));
    } catch {
      /* the stream's watchdog reports the outage */
    }
    if (!stopped) eventsTimer = setTimeout(pollEvents, EVENTS_EVERY_MS);
  }

  function closeStream() {
    if (es) {
      es.onmessage = null;
      es.onerror = null;
      es.onopen = null;
      try {
        es.removeEventListener('tick', onTick);
        es.removeEventListener('event', onPushedEvent);
        es.removeEventListener('status', onPushedStatus);
        es.removeEventListener('info', onPushedInfo);
      } catch {
        /* older EventSource shims */
      }
      es.close();
      es = null;
    }
  }

  /** A frame from the stream: any of them proves the Core is alive. */
  function alive() {
    lastMessage = mono();
    lastMessageWall = Date.now();
    messages++;
    attempt = 0;
    if (!online) {
      setOnline(true);
      // Back after an outage (or the first frame): one full read fills what the stream leaves out.
      if (everConnected) fullRead().catch(() => {});
    }
    everConnected = true;
  }

  function parse(e) {
    try {
      return JSON.parse(e.data);
    } catch {
      return undefined;
    }
  }

  function onTick(e) {
    const body = parse(e);
    if (!body || typeof body !== 'object') return;
    alive();
    hooks.onSnapshot(body);
  }

  function onPushedStatus(e) {
    const body = parse(e);
    if (!body || typeof body !== 'object') return;
    alive();
    hooks.onStatus(body);
  }

  function onPushedEvent(e) {
    const body = parse(e);
    if (!body || typeof body !== 'object') return;
    alive();
    hooks.onEvents(body);
  }

  function onPushedInfo(e) {
    const body = parse(e);
    if (!body || typeof body !== 'object') return;
    hooks.onInfo(body);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    closeStream();
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    reconnects++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = 0;
      connect();
    }, delay);
  }

  function connect() {
    if (stopped) return;
    closeStream();
    if (!ES) return;
    openedAt = mono();
    let source;
    try {
      source = new ES(`${base}api/stream`);
    } catch {
      scheduleReconnect();
      return;
    }
    es = source;
    source.onmessage = onTick; // an unnamed frame is a tick too
    source.addEventListener('tick', onTick);
    source.addEventListener('status', onPushedStatus);
    source.addEventListener('event', onPushedEvent);
    source.addEventListener('info', onPushedInfo);
    source.onerror = () => {
      // CLOSED: the browser gave up (an HTTP error, a wrong type); CONNECTING: it will retry by
      // itself, but our watchdog still decides when the Core counts as offline.
      if (source.readyState === 2) scheduleReconnect();
    };
  }

  function check() {
    if (stopped) return;
    const now = mono();
    const silent = now - lastMessage;
    if (online && silent > STALE_MS) setOnline(false);
    // A stream that stays silent (a hung proxy, a sleeping laptop on the far end) is replaced.
    if (es && !reconnectTimer && silent > STALE_MS * 2 && now - openedAt > STALE_MS * 2) scheduleReconnect();
  }

  async function start() {
    stopped = false;
    const ok = await fullRead().catch(() => false);
    connect();
    watchdog = setInterval(check, 1000);
    eventsTimer = setTimeout(pollEvents, EVENTS_EVERY_MS);
    return ok;
  }

  /**
   * The page is visible again after a while in the background (the phone unlocked, the tab brought
   * back): the browser may have dropped the stream while the page slept, without telling. Open a
   * new one at once and read everything, and give it a moment before calling the Core offline, so
   * the phone shows fresh values instead of a red banner first.
   */
  function resume() {
    if (stopped) return;
    lastMessage = mono();
    attempt = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = 0;
    }
    connect();
    fullRead().catch(() => {});
  }

  function stop() {
    stopped = true;
    closeStream();
    clearTimeout(reconnectTimer);
    clearTimeout(eventsTimer);
    clearInterval(watchdog);
    reconnectTimer = 0;
  }

  return {
    start,
    stop,
    resume,
    isOnline: () => online,
    lastMessageAt: () => lastMessageWall,
    stats: () => ({ messages, reconnects, online }),
  };
}
