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
// The home base brain (Core 1.1.0): read with everything else, followed through the stream's
// `job`, `watcher`, `spend` and `briefing` frames, and read again this often as a backstop.
const BRAIN_EVERY_MS = 60000;
const BRAIN_EVENTS = ['job', 'watcher', 'spend', 'briefing'];

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

/** Like getJson, but an HTTP error is an answer ({status, body}), not a failure: a Core without a
 *  brain answers api/brain with 404, which means "no brain UI", while a network error means "keep
 *  what we have". */
async function getStatusJson(url, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined, headers: { accept: 'application/json' } });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Does a Core of this version have the brain API (1.1.0 and later)? Unknown versions are asked. */
export function hasBrainApi(version) {
  const m = /^v?(\d+)\.(\d+)/.exec(String(version ?? ''));
  if (!m) return version === undefined || version === null || version === '';
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 1 || (major === 1 && minor >= 1);
}

/**
 * @param {{
 *   onStatus: (raw: object) => void,          a full status (replaces the merged state)
 *   onSnapshot: (raw: object) => void,        a compact stream snapshot (merged into the state)
 *   onInfo: (info: object) => void,
 *   onHistory: (body: object) => void,
 *   onEvents: (body: object) => void,         the events body, or one pushed event
 *   onLink: (online: boolean) => void,        the link went up / down
 *   onBrain?: (body: object|null) => void,    GET api/brain (null: the Core has no brain, 404)
 *   onJobs?: (body: object) => void, onWatchers?: (body: object) => void,
 *   onBriefing?: (body: object|null) => void, the latest briefing (null: none yet)
 *   onBrainEvent?: (name: string, body: object) => void,   a job/watcher/spend/briefing frame
 *   fetchImpl?: typeof fetch, EventSourceImpl?: typeof EventSource, base?: string,
 *   monoNow?: () => number,                    a monotonic clock in ms (tests)
 * }} hooks
 */
export function createClient(hooks) {
  const base = hooks.base || '';
  const mono = hooks.monoNow || monoNow;
  const fetchImpl = hooks.fetchImpl || ((...a) => fetch(...a));
  const ES = hooks.EventSourceImpl || (typeof EventSource === 'function' ? EventSource : null);
  const noop = () => {};
  const onBrain = hooks.onBrain || noop;
  const onJobs = hooks.onJobs || noop;
  const onWatchers = hooks.onWatchers || noop;
  const onBriefing = hooks.onBriefing || noop;
  const onBrainEvent = hooks.onBrainEvent || noop;
  let brainTimer = 0;
  let brainReads = 0;
  let coreVersion; // from api/info: the brain API exists from 1.1.0
  let briefingAt = null; // the brain's briefing.lastAt when the briefing was last read
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
  let everOpened = false; // the first stream open follows start()'s own full read
  let infoOk = false; // api/info has been read (a page loaded while the Core was down has not)
  let reopenReads = 0;

  function setOnline(v) {
    if (v === online) return;
    online = v;
    hooks.onLink(v);
  }

  async function fullRead() {
    const results = await Promise.allSettled([
      // The brain is read once the Core has said which version it is: a 1.0 Core has none, and
      // asking it anyway would only log a 404 in the browser's console.
      getJson(`${base}api/info`, fetchImpl).then((b) => {
        infoOk = true;
        hooks.onInfo(b);
        coreVersion = b && typeof b === 'object' ? b.version : undefined;
        return hasBrainApi(coreVersion) ? readBrain() : onBrain(null);
      }),
      getJson(`${base}api/status`, fetchImpl).then((b) => hooks.onStatus(b)),
      getJson(`${base}api/history?range=15m&series=cpu,gpu,ram,netRx,netTx`, fetchImpl).then((b) => hooks.onHistory(b)),
      getJson(`${base}api/events?limit=40`, fetchImpl).then((b) => hooks.onEvents(b)),
    ]);
    return results[1].status === 'fulfilled';
  }

  /** The latest briefing (after a `briefing` frame, which carries only its date and greeting). */
  async function readBriefing() {
    try {
      const r = await getStatusJson(`${base}api/briefing`, fetchImpl);
      if (r.status === 200) onBriefing(r.body);
      else if (r.status === 404) onBriefing(null);
    } catch {
      /* the next read catches up */
    }
  }

  /**
   * The brain: api/brain, then its jobs, watchers and the latest briefing. A 404 means the Core
   * has no brain (1.0.0): the page shows none of it. Any other failure keeps what is shown.
   */
  async function readBrain(force = false) {
    brainReads++;
    let r;
    try {
      r = await getStatusJson(`${base}api/brain`, fetchImpl);
    } catch {
      return;
    }
    if (r.status === 404) {
      onBrain(null);
      return;
    }
    if (r.status !== 200 || !r.body || typeof r.body !== 'object') return;
    onBrain(r.body);
    // The latest briefing only when there is one (briefing.lastAt) and it changed since the last
    // read: before the first one the Core answers 404 none_yet, which the console would log.
    const lastAt = r.body.briefing && typeof r.body.briefing === 'object' ? r.body.briefing.lastAt ?? null : null;
    const reads = [getJson(`${base}api/jobs?limit=30`, fetchImpl).then((b) => onJobs(b)), getJson(`${base}api/watchers`, fetchImpl).then((b) => onWatchers(b))];
    if (!lastAt) {
      briefingAt = null;
      onBriefing(null);
    } else if (lastAt !== briefingAt || force) {
      reads.push(readBriefing().then(() => (briefingAt = lastAt)));
    }
    await Promise.allSettled(reads);
  }

  async function pollBrain() {
    if (stopped) return;
    if (online && hasBrainApi(coreVersion)) await readBrain().catch(() => {});
    if (!stopped) brainTimer = setTimeout(pollBrain, BRAIN_EVERY_MS);
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
        for (const name of BRAIN_EVENTS) es.removeEventListener(name, onPushedBrain);
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
      // Back after an outage (or the first frame of a page loaded while the Core was down): one
      // full read fills what the stream leaves out, api/info's version among it.
      if (everConnected || !infoOk) fullRead().catch(() => {});
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

  /** A brain frame (job, watcher, spend, briefing): compact objects as the Core's contract says. */
  function onPushedBrain(e) {
    const body = parse(e);
    if (!body || typeof body !== 'object') return;
    alive();
    onBrainEvent(e.type, body);
  }

  function onPushedInfo(e) {
    const body = parse(e);
    if (!body || typeof body !== 'object') return;
    if (body.version !== undefined) coreVersion = body.version;
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

  /**
   * @param {boolean} [readOnOpen] false when the caller reads everything itself (resume)
   */
  function connect(readOnOpen = true) {
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
    let opened = false;
    // The stream (re)opened. A restarted Core (systemctl restart, an update) is back within the
    // browser's own 3 s retry, before the watchdog calls it offline, so this is where a restart
    // shows: read everything again. api/info's new version then reloads the kiosk and tells the
    // brain reads which Core this is. While offline, the first frame's full read does it (alive).
    source.onopen = () => {
      const first = !opened;
      opened = true;
      if (!everOpened) {
        everOpened = true; // start() has just read everything
        return;
      }
      if (first && !readOnOpen) return;
      if (!online) return;
      reopenReads++;
      fullRead().catch(() => {});
    };
    source.onmessage = onTick; // an unnamed frame is a tick too
    source.addEventListener('tick', onTick);
    source.addEventListener('status', onPushedStatus);
    source.addEventListener('event', onPushedEvent);
    source.addEventListener('info', onPushedInfo);
    for (const name of BRAIN_EVENTS) source.addEventListener(name, onPushedBrain);
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
    brainTimer = setTimeout(pollBrain, BRAIN_EVERY_MS);
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
    connect(false);
    fullRead().catch(() => {});
  }

  function stop() {
    stopped = true;
    closeStream();
    clearTimeout(reconnectTimer);
    clearTimeout(eventsTimer);
    clearTimeout(brainTimer);
    clearInterval(watchdog);
    reconnectTimer = 0;
  }

  return {
    start,
    stop,
    resume,
    isOnline: () => online,
    lastMessageAt: () => lastMessageWall,
    readBriefing,
    readBrain,
    stats: () => ({ messages, reconnects, online, brainReads, reopenReads }),
  };
}
