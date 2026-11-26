// The relay: Jarvis for Chrome's end of the link to Jarvis (the web app) through the owner's home
// base (Core 1.3.0, wire v1, SPEC §32). The app lives in the owner's usual Chrome profile and the
// extension in the Jarvis profile; neither can reach the other directly, so each leaves sealed
// messages in the other's box at the home base (envelope.js), which keeps them in memory for 2
// minutes and can't read them.
//
//   GET  <core>/api/relay/to-ext?after=<id>&wait=<s>   the long poll: messages for the extension
//   POST <core>/api/relay/to-app                       a message for the app
//   GET  <core>/api/relay/status                       { extSeenAt, appSeenAt }
//
// The service worker long-polls `to-ext` with a 20-s wait (a fetch longer than 30 s can end a
// worker), each poll after one extension API call (it resets the worker's idle timer); while a
// task from Jarvis runs it waits 10 s, so 20 s without an answer means the home base can't be
// reached (link.js then pauses that task). A chrome.alarms tick every 30 s starts the loop again
// when Chrome stopped the worker. While the home base can't be reached the loop backs off (1 s up
// to 30 s). Where it left off and the ids it has read are kept (chrome.storage.local), so a message
// is never taken twice, also after a restart.
//
// Nothing here is logged: not the messages, not the key, not the home base's answers.

import { BOX_TO_APP, BOX_TO_EXT, SeenIds, importLinkKey, seal, unseal } from './envelope.js';
import { sleep as realSleep } from '../shared/util.js';

export const POLL_WAIT_S = 20;
export const POLL_WAIT_BUSY_S = 10;
export const POLL_GRACE_MS = 5000; // a poll with no answer this long after its wait has failed
export const SEND_TIMEOUT_MS = 8000;
export const UNREACHABLE_MS = 20 * 1000;
export const ONLINE_MS = 60 * 1000;
export const STATUS_EVERY_MS = 30 * 1000;
export const BACKOFF_MS = Object.freeze([1000, 2000, 5000, 10000, 20000, 30000]);
export const ALARM = 'jarvis-relay';
export const ALARM_PERIOD_MIN = 0.5; // 30 s: Chrome's shortest
const MAX_MESSAGES = 50;

/** How long to wait after the `failures`-th failure in a row (a 429's Retry-After counts, up to 60 s). */
export function backoffMs(failures, retryAfterS = 0) {
  const step = BACKOFF_MS[Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1];
  const asked = Number(retryAfterS) > 0 ? Math.min(60, Number(retryAfterS)) * 1000 : 0;
  return Math.max(step, asked);
}

const isMsg = (m) => !!m && typeof m === 'object' && typeof m.id === 'string' && typeof m.iv === 'string' && typeof m.ct === 'string';

export class Relay {
  /**
   * link: { core, key } (store.getLink()); store: { getRelayState, setRelayState }; onMessage(message)
   * gets each message the app sent ({ kind, id, at, body }); onState(state) hears every change of
   * what the side panel shows; busy() tells whether a task from Jarvis runs (the shorter wait).
   */
  constructor({ chrome, link, store, onMessage, onState = () => {}, busy = () => false, fetch = (...a) => globalThis.fetch(...a), now = () => Date.now(), sleep = realSleep }) {
    Object.assign(this, { chrome, link, store, onMessage, onState, busy, fetchFn: fetch, now, sleep });
    this.running = false;
    this.after = '';
    this.seen = new SeenIds();
    this.lastOkAt = 0;
    this.failures = 0;
    this.appSeenAt = 0;
    // When a message from the app last opened with this link's key (saved): until then the key isn't
    // proven, and the app reading its box (with whatever key it has) doesn't count as online.
    this.heardAt = 0;
    this.statusAt = 0;
    this.abort = null;
    this.key = null;
  }

  /** Starts the loop (a second call while it runs does nothing). */
  start() {
    if (this.running) return this.loop;
    this.running = true;
    this.loop = this.run().catch(() => {}).finally(() => {
      this.running = false;
    });
    return this.loop;
  }

  /** Stops the loop at once (the poll in flight is abandoned). */
  stop() {
    this.running = false;
    try {
      this.abort?.abort();
    } catch {
      /* already done */
    }
  }

  async cryptoKey() {
    if (!this.key) this.key = await importLinkKey(this.link.key);
    return this.key;
  }

  /** ms since the home base last answered (Infinity before it ever did). */
  unreachableFor(now = this.now()) {
    return this.lastOkAt ? Math.max(0, now - this.lastOkAt) : Infinity;
  }

  /**
   * What the side panel shows: { reachable, appOnline, failing }. Online: Jarvis has answered with this
   * link's key at least once, and it spoke or read its box in the last minute.
   */
  state(now = this.now()) {
    const recent = (t) => !!t && now - t < ONLINE_MS;
    return {
      reachable: this.unreachableFor(now) < ONLINE_MS && this.failures === 0,
      appOnline: !!this.heardAt && (recent(this.heardAt) || recent(this.appSeenAt)),
      failing: this.failures > 0,
    };
  }

  emitState() {
    const s = this.state();
    const sig = JSON.stringify(s);
    if (sig === this.stateSig) return;
    this.stateSig = sig;
    try {
      this.onState(s);
    } catch {
      /* the panel's business */
    }
  }

  answered() {
    this.lastOkAt = this.now();
    this.failures = 0;
    this.emitState();
  }

  async request(method, path, body, timeoutMs) {
    const abort = new AbortController();
    if (method === 'GET' && path.startsWith('to-ext')) this.abort = abort;
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const res = await this.fetchFn(`${this.link.core}/api/relay/${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        credentials: 'omit',
        signal: abort.signal,
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { ok: res.ok, status: res.status, data, retryAfter: Number(res.headers?.get?.('retry-after')) || 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  async run() {
    const saved = await this.store.getRelayState().catch(() => ({ after: '', seen: [], heardAt: 0 }));
    this.after = saved.after || '';
    this.seen = new SeenIds(saved.seen);
    this.heardAt = Math.max(this.heardAt, Number(saved.heardAt) || 0);
    while (this.running) {
      // One extension API call before each poll: it tells Chrome the worker is busy.
      try {
        await this.chrome.runtime?.getPlatformInfo?.();
      } catch {
        /* not needed for the poll itself */
      }
      const wait = this.busy() ? POLL_WAIT_BUSY_S : POLL_WAIT_S;
      let res = null;
      try {
        res = await this.request('GET', `to-ext?${this.after ? `after=${encodeURIComponent(this.after)}&` : ''}wait=${wait}`, null, wait * 1000 + POLL_GRACE_MS);
      } catch {
        res = null;
      }
      if (!this.running) break;
      const data = res?.ok ? res.data : null;
      if (data && Array.isArray(data.messages)) {
        this.answered();
        for (const m of data.messages.slice(0, MAX_MESSAGES)) {
          if (!this.running) break;
          await this.receive(m);
        }
        // (A message may have ended the link: an unlinked relay keeps nothing.)
        if (!this.running) break;
        if (typeof data.last === 'string' && data.last.length <= 64) this.after = data.last;
        await this.save();
        if (this.now() - this.statusAt >= STATUS_EVERY_MS) await this.readStatus();
        continue;
      }
      // (A cursor the home base won't take is dropped: it then answers with every message it holds.)
      if (res?.status === 400) this.after = '';
      this.failures += 1;
      this.emitState();
      await this.sleep(backoffMs(this.failures, res?.status === 429 ? res.retryAfter : 0));
    }
  }

  async save() {
    await this.store.setRelayState({ after: this.after, seen: this.seen.toJSON(), heardAt: this.heardAt }).catch(() => {});
  }

  /** One message from the box: opened, counted as read (and saved) before it is acted on. */
  async receive(m) {
    if (!isMsg(m)) return;
    let opened;
    try {
      opened = await unseal(await this.cryptoKey(), { box: BOX_TO_EXT, msg: m, now: this.now(), seen: this.seen });
    } catch {
      return;
    }
    if (!opened.ok || !this.running) return; // dropped without a word
    this.heardAt = this.appSeenAt = this.now();
    await this.save();
    this.emitState();
    try {
      await this.onMessage(opened.message);
    } catch {
      /* a handler's failure ends with that message */
    }
  }

  /** When the app last read its box (the side panel's "online"). */
  async readStatus() {
    this.statusAt = this.now();
    try {
      const res = await this.request('GET', 'status', null, SEND_TIMEOUT_MS);
      const seenAt = Number(res?.data?.appSeenAt);
      if (res?.ok && Number.isFinite(seenAt) && seenAt > this.appSeenAt && seenAt <= this.now() + 60000) this.appSeenAt = seenAt;
      this.emitState();
    } catch {
      /* the next poll says whether the home base answers */
    }
  }

  /**
   * Sends one message to the app; resolves true once the home base has it. One retry, unless the
   * home base isn't answering anyway (then it fails fast: what waits behind it isn't held up).
   */
  async send(kind, body = {}) {
    let msg;
    try {
      msg = await seal(await this.cryptoKey(), { box: BOX_TO_APP, kind, body, at: this.now() });
    } catch {
      return false;
    }
    const attempts = this.failures > 0 ? 1 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await this.request('POST', 'to-app', msg, SEND_TIMEOUT_MS);
        if (res.ok) {
          this.answered();
          return true;
        }
        if (res.status === 400 || res.status === 413) return false;
      } catch {
        /* try once more */
      }
      if (attempt + 1 < attempts) await this.sleep(1000);
    }
    return false;
  }
}
