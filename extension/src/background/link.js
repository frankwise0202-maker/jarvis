// Voice from Jarvis: what Jarvis (the web app, in the owner's usual Chrome profile) may ask of
// Jarvis for Chrome through the relay (relay.js), and what the extension tells it (wire v1, SPEC
// §32; README: Voice from Jarvis). Everything Jarvis sends is a request, never an order: the
// extension checks each one by its own rules, and Jarvis can't do anything here that the owner
// couldn't do with a click, nor approve anything the voice policy keeps for a click.
//
// From Jarvis (each gets exactly one `reply` whose `re` is its id):
//   hello, ping      who is there; the extension's state
//   open             open an address in the Jarvis window, beside Jarvis (no debugger, no task).
//                    An address that does something waits for the owner's click on its card here.
//   start            a task from the owner's spoken words (only while "Tasks from Jarvis" is on, at
//                    most 30 a day, one task at a time), marked "From Jarvis (voice)"; it runs within
//                    `limitUsd`, the budget the owner heard, never above this profile's (MONEY-3)
//   stop             stops the running task
//   answer           the owner's answer to a prompt, by voice or on Jarvis's card (voice-policy.js)
//   unlinked         Jarvis unlinked: so does the extension
//   rekey            the link's new key, sent by Jarvis under the code's key right after linking
//                    (REDTEAM-LINK-4): the extension switches and answers under the new key; the
//                    code's key is still opened until Jarvis uses the new one (or 10 minutes), so
//                    the code works once
// An open, start or answer more than 8 s old is refused as 'gone' ("too late") and does nothing
// (lead decision D5): Jarvis gave up on it at 10 s and told the owner it didn't work, so a worker
// woken late by its alarm must not start a task the owner was told never started. stop, ping,
// hello and unlinked are always taken (within the envelope's 120 s).
// To Jarvis: reply, hello, status (on every change, every 60 s while a task runs), task and done
// (tasks from Jarvis only; no pictures), prompt (every prompt the side panel shows), prompt-closed.
//
// A task from Jarvis pauses itself, as Take over does, when Jarvis's box at the home base hasn't
// been read for 20 s (the extension's own posts getting through don't count), and when the link
// ends mid-task (REDTEAM-LINK-3): a Stop said to Jarvis must never be lost on the way. The side
// panel's Stop and ⌘⇧. always work. When no side panel is open, a question that needs a click opens
// a small approval window.

import { ALARM, ALARM_PERIOD_MIN, Relay, UNREACHABLE_MS } from './relay.js';
import { VOICE_APPROVALS_AVAILABLE, approvalsOn, promptFields, promptHash, spokenLine, voiceDecision, voiceSummary } from './voice-policy.js';
import { addressAction } from './actions.js';
import { fileKind } from './controller.js';
import { MAX_NAVIGATE_URL, addressConcern, blockedReason, cardAddress, siteOf } from './sites.js';
import { FINAL_STATUSES } from '../shared/protocol.js';
import { VOICE_TASKS_PER_DAY } from '../shared/storage.js';
import { displayText, truncate, uid } from '../shared/util.js';

export const EXT_NAME = 'jarvis-for-chrome';
export const MAX_TASK_TEXT = 2000;
export const MAX_ANSWER = 2000;
export const STATUS_EVERY_MS = 60 * 1000;
export const TASK_EVERY_MS = 2000; // (the to-app box takes 120 requests a minute, the app's reads included)
export const CARD_LIFE_MS = 5 * 60 * 1000;
export const OPENED_SITE_LIFE_MS = 10 * 60 * 1000;
export const APPROVAL_WINDOW = Object.freeze({ width: 420, height: 620 });
export const FRESH_MS = 8 * 1000; // D5: an open, start or answer older than this is too late
export const FRESH_KINDS = Object.freeze(new Set(['open', 'start', 'answer']));
export const STALE_MS = 60 * 1000; // a message to Jarvis not sent within this long is dropped
export const REPLY_RETRY_MS = 10 * 1000; // a reply to a start or a stop is tried this long after the request (MISSED-LINK-A)
export const REKEY_GRACE_MS = 10 * 60 * 1000; // the code's key is still opened this long after a rekey (REDTEAM-LINK-4)
export const OPEN_HOLD_MS = 30 * 1000; // downloads an address opened for Jarvis starts are held this long (REDTEAM-LINK-9)
const KEY_TEXT = /^[A-Za-z0-9_-]{43}$/;

const STOPPED_AT_LIMIT = /^Stopped at (your budget|the step limit)\b/;

const WHY = Object.freeze({
  off: 'Tasks from Jarvis are off in Jarvis for Chrome (side panel → Settings → Voice from Jarvis).',
  setup: 'Finish setting up Jarvis for Chrome in its side panel first.',
  busy: 'Jarvis for Chrome is already working on a task. Stop it first.',
  cap: `Jarvis for Chrome has run ${VOICE_TASKS_PER_DAY} tasks from Jarvis today, its limit for a day. Start more in its side panel.`,
  gone: 'That question isn’t open any more.',
  changed: 'That question changed.',
  noTask: 'No task is running in Jarvis for Chrome.',
  needsClick: 'That address looks like it does something, so it waits for your click in the Jarvis window.',
  bad: 'Jarvis for Chrome didn’t understand that request.',
});

/**
 * Whether Jarvis may have `input` opened in the Jarvis window: { ok: true, url, site } or
 * { ok: false, reason: 'bad' | 'blocked' | 'needs-click', why, url?, site?, detail? }. The same
 * checks as the extension's own: never Chrome's pages, other extensions, files or the Web Store
 * (blockedReason), only http and https, no user name or password, no address too long to show
 * whole; an address that says it does something (addressAction: "?add-to-cart=42", "/act/delete",
 * an installer) or hides something (addressConcern: invisible characters, letters written as
 * codes) waits for the owner's click on its card.
 */
export function openVerdict(input) {
  const bad = { ok: false, reason: 'bad', why: 'That isn’t a web address.' };
  if (typeof input !== 'string' || !input || input.length > MAX_NAVIGATE_URL * 2) return bad;
  let u;
  try {
    u = new URL(input);
  } catch {
    return bad;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'blocked', why: 'Jarvis for Chrome opens only http and https addresses.' };
  if (u.username || u.password) return { ok: false, reason: 'blocked', why: 'Jarvis for Chrome never opens an address with a user name or password in it.' };
  const blocked = blockedReason(u.href);
  if (blocked) return { ok: false, reason: 'blocked', why: `Jarvis for Chrome can’t open that: ${blocked}.` };
  if (u.href.length > MAX_NAVIGATE_URL) return { ok: false, reason: 'blocked', why: 'That address is too long to show you whole.' };
  const site = siteOf(u.href);
  if (!site) return bad;
  const concern = addressConcern(u.href);
  const acts = addressAction(u.href);
  if (concern || acts) {
    const detail = concern ? `It has ${concern} in it.` : acts.file ? 'It looks like a file to download.' : `Its address says “${acts.word}”.`;
    return { ok: false, reason: 'needs-click', why: WHY.needsClick, url: u.href, site, detail };
  }
  return { ok: true, url: u.href, site };
}

/** The sites named in the owner's words, written as addresses ("bestbuy.com", "bestbuy dot com"). */
export function namedSites(text) {
  const t = String(text ?? '').toLowerCase().replace(/\s+dot\s+/g, '.');
  const out = new Set();
  for (const m of t.matchAll(/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/g)) {
    const site = siteOf(m[0]);
    if (site && site.includes('.')) out.add(site);
  }
  return out;
}

/** A window's place on screen from Jarvis ({ left, top, width, height }), or null. */
export function cleanRect(rect) {
  if (!rect || typeof rect !== 'object') return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN);
  const r = { left: n(rect.left), top: n(rect.top), width: n(rect.width), height: n(rect.height) };
  if (Object.values(r).some(Number.isNaN)) return null;
  // (The same bounds as the app's cleanRect.)
  if (r.width < 100 || r.height < 100 || r.width > 100000 || r.height > 100000 || Math.abs(r.left) > 100000 || Math.abs(r.top) > 100000) return null;
  return r;
}

/**
 * Whether a request from Jarvis came too late to act on (D5): an open, start or answer whose `at`
 * (Jarvis's clock: the same Mac) is more than FRESH_MS old. Exactly FRESH_MS still counts.
 */
export function tooLate(kind, at, now) {
  return FRESH_KINDS.has(kind) && now - at > FRESH_MS;
}

/** A task's status for Jarvis's `done`: 'done' | 'stopped' | 'failed' | 'limit'. */
export function doneStatus(task) {
  if (task.status === 'done') return 'done';
  if (task.status === 'stopped') return !task.stoppedVia && STOPPED_AT_LIMIT.test(task.error || '') ? 'limit' : 'stopped';
  return 'failed';
}

export class JarvisLink {
  constructor({ chrome, controller, store, version = '', now = () => Date.now(), relayDeps = {}, approvalsAvailable = VOICE_APPROVALS_AVAILABLE }) {
    Object.assign(this, { chrome, controller, store, version, now, relayDeps, approvalsAvailable });
    this.link = null;
    this.relay = null;
    this.cards = [];
    this.openedSites = new Map(); // site -> when Jarvis opened it (the voice policy's "Allow once")
    this.openHolds = []; // { url, site, until }: addresses opened for Jarvis whose downloads wait for a click (LINK-9)
    this.heldDownloads = new Map(); // card id -> { item, suggest, settled }
    this.sentTask = new Map(); // taskId -> { status, at } of the last `task` message
    this.doneSent = new Set();
    this.statusSig = '';
    this.approvalWindowId = null;
    this.queue = Promise.resolve(); // messages to Jarvis leave in the order they were made
    controller.hooks = {
      onPrompt: (run, prompt, facts) => this.onPrompt(run, prompt, facts),
      onPromptClosed: (run, id, how) => this.send('prompt-closed', { promptId: id, how }),
      onTask: (task) => this.onTask(task),
      onConnect: (port) => this.sendState(port),
      onPanelMessage: (msg) => this.onPanelMessage(msg),
    };
  }

  // -------------------------------------------------------------------------------------------
  // The link itself

  /** Reads the stored link and starts the relay when there is one. */
  async init() {
    const link = await this.store.getLink().catch(() => null);
    await this.useLink(link);
    // A task from Jarvis that a restart of the worker cut off (Controller.restore): Jarvis hears,
    // once, that it ended.
    let told = false;
    for (const t of this.controller.tasks) {
      if (t.from !== 'voice' || t.status !== 'interrupted' || t.toldJarvis || !this.relay) continue;
      t.toldJarvis = told = true;
      this.doneSent.add(t.id);
      this.send('done', { id: t.id, status: 'failed', answer: truncate(t.error || '', MAX_ANSWER), costUsd: t.cost || 0 });
    }
    if (told) this.controller.persistSoon();
  }

  /** chrome.storage changed: the link (the side panel linked or unlinked), the switches or the budget. */
  onStorageChanged(changes) {
    if (changes?.chromeLink) this.store.getLink().then((link) => this.useLink(link), () => {});
    if (changes?.['jarvis.voice'] || changes?.['jarvis.sites'] || changes?.['jarvis.settings']) {
      this.sendStatus();
      this.sendState();
    }
  }

  /** The alarm's tick: the relay runs whenever there is a link. */
  ensureRunning() {
    if (this.link && this.relay && !this.relay.running) this.relay.start();
  }

  async useLink(link) {
    const same = link && this.link && link.core === this.link.core && link.key === this.link.key;
    if (same) {
      // (The same link, maybe with the code's key dropped or kept: a rekey isn't a new link.)
      this.link = link;
      this.relay?.setKeys(link);
      return this.ensureRunning();
    }
    if (this.link) this.pauseForLinkEnd(); // a new link, or none: the old one can't bring a Stop any more
    this.relay?.stop();
    this.relay = null;
    this.link = link;
    this.statusSig = '';
    if (!link) {
      this.chrome.alarms?.clear?.(ALARM)?.catch?.(() => {});
      this.sendState();
      return;
    }
    this.relay = new Relay({
      chrome: this.chrome,
      link,
      store: this.store,
      onMessage: (m) => this.onMessage(m),
      onState: () => this.sendState(),
      busy: () => this.controller.run?.task.from === 'voice',
      now: this.now,
      ...this.relayDeps,
    });
    this.relay.start();
    try {
      if (!(await this.chrome.alarms?.get?.(ALARM))) await this.chrome.alarms?.create?.(ALARM, { periodInMinutes: ALARM_PERIOD_MIN });
    } catch {
      /* the loop still runs while the worker does */
    }
    this.sendState();
    await this.send('hello', await this.helloBody());
    await this.sendStatus({ force: true });
  }

  /** `hello`: who is there, and the task budget a task from Jarvis gets (MONEY-3: what Jarvis says is enforced). */
  async helloBody() {
    return { ext: EXT_NAME, version: this.version, ...(await this.budgetFields()) };
  }

  async budgetFields() {
    const settings = await this.store.getSettings().catch(() => null);
    return settings ? { budgetUsd: settings.budgetUsd, maxSteps: settings.maxSteps } : {};
  }

  /** Unlinks: tells Jarvis (when it can), then forgets the key and the home base's permission. */
  async unlink({ tell = true } = {}) {
    const link = this.link;
    if (!link) return;
    if (tell) await this.send('unlinked', {});
    this.pauseForLinkEnd();
    this.relay?.stop();
    this.relay = null;
    this.link = null;
    this.cards = [];
    this.sendCards();
    await this.store.clearLink().catch(() => {});
    try {
      await this.chrome.alarms?.clear?.(ALARM);
    } catch {
      /* gone already */
    }
    try {
      await this.chrome.permissions?.remove?.({ origins: [`${link.core}/*`] });
    } catch {
      /* a development build's own host */
    }
    this.sendState();
  }

  /**
   * Sends a message to Jarvis, after every message made before it (a prompt never arrives after
   * its prompt-closed). `body` may be a function that makes it. Resolves false when unlinked or
   * the home base doesn't take it.
   */
  send(kind, body, opts = {}) {
    const relay = this.relay;
    if (!relay) return Promise.resolve(false);
    const made = this.now();
    const job = this.queue.then(async () => {
      // (One that waited a minute behind an unreachable home base is stale: Jarvis would drop it.)
      if (this.relay !== relay || this.now() - made > STALE_MS) return false;
      const b = typeof body === 'function' ? await body() : body;
      return b ? relay.send(kind, b, opts) : false;
    });
    this.queue = job.catch(() => false);
    return job;
  }

  reply(re, body, opts = {}) {
    return this.send('reply', { re, ...body }, opts);
  }

  /**
   * The reply to a start or a stop: tried again until about 10 s after the request was made (and
   * at least a couple of seconds), so a moment's failure can't leave Jarvis telling the owner a task
   * never started while it runs, or that a stop didn't arrive (MISSED-LINK-A).
   */
  replyHard(re, at, body) {
    return this.reply(re, body, { until: Math.max((Number(at) || 0) + REPLY_RETRY_MS, this.now() + 2000) });
  }

  async approvalsAvailableNow() {
    return this.approvalsAvailable === true || (await this.store.getDevVoiceApprovals?.().catch(() => false)) === true;
  }

  async approvals() {
    const voice = await this.store.getVoice();
    return approvalsOn(voice.approvals, await this.approvalsAvailableNow());
  }

  // -------------------------------------------------------------------------------------------
  // What the side panel shows

  async linkState() {
    const voice = await this.store.getVoice().catch(() => ({ tasksFromJarvis: false, approvals: false }));
    const available = await this.approvalsAvailableNow();
    const relay = this.relay?.state() || { reachable: false, appOnline: false, failing: false };
    return {
      linked: !!this.link,
      host: this.link ? new URL(this.link.core).host : '',
      linkedAt: this.link?.linkedAt || 0,
      ...relay,
      tasksFromJarvis: voice.tasksFromJarvis,
      approvals: approvalsOn(voice.approvals, available),
      approvalsAvailable: available,
    };
  }

  async sendState(port = null) {
    const link = await this.linkState().catch(() => null);
    if (link) this.controller.post({ type: 'link', link }, port);
    this.sendCards(port);
  }

  sendCards(port = null) {
    const now = this.now();
    for (const c of this.cards) if (c.kind === 'download' && now - c.at >= CARD_LIFE_MS) this.settleDownload(c.id, false); // unanswered: not saved
    this.cards = this.cards.filter((c) => now - c.at < CARD_LIFE_MS);
    this.controller.post({ type: 'cards', cards: this.cards.map(({ id, kind, shown, site, detail, name, at }) => ({ id, ...(kind ? { kind } : {}), shown, site, detail, ...(name ? { name } : {}), at })) }, port);
  }

  // -------------------------------------------------------------------------------------------
  // From Jarvis

  async onMessage({ kind, id, at, body, viaPrev = false }) {
    // Jarvis seals with the link's new key: the code's key is no longer needed (REDTEAM-LINK-4).
    if (!viaPrev && this.link?.prev) await this.dropPrevKey();
    // Too late to act on: Jarvis has already told the owner it didn't work (D5).
    if (tooLate(kind, at, this.now())) return this.reply(id, { ok: false, reason: 'gone', why: 'too late' });
    try {
      switch (kind) {
        case 'rekey':
          return this.reply(id, await this.rekey(body, viaPrev));
        case 'hello':
          await this.reply(id, { ok: true });
          await this.send('hello', await this.helloBody());
          return this.sendStatus({ force: true });
        case 'ping':
          return this.reply(id, { ok: true, status: await this.statusBody() });
        case 'open':
          return this.reply(id, await this.open(body));
        case 'start':
          return this.replyHard(id, at, await this.startTask(body));
        case 'stop':
          return this.replyHard(id, at, this.stopTask());
        case 'answer':
          return this.reply(id, await this.answer(body));
        case 'unlinked':
          await this.reply(id, { ok: true });
          return this.unlink({ tell: false });
        default:
          return this.reply(id, { ok: false, reason: 'bad', why: WHY.bad });
      }
    } catch {
      return this.reply(id, { ok: false, reason: 'bad', why: WHY.bad });
    }
  }

  /**
   * `rekey { key }` (REDTEAM-LINK-4): Jarvis replaces the code's key with a new one right after
   * linking, sealed with the code's key. The first one switches the link: messages go out under the
   * new key from now on (this reply too), and the code's key is still opened until Jarvis uses the
   * new one, or REKEY_GRACE_MS. The same new key again (Jarvis didn't hear the answer) is answered
   * again; any other is refused, so the code can't move the link once it has been used.
   */
  async rekey(body, viaPrev) {
    const next = typeof body?.key === 'string' ? body.key : '';
    const link = this.link;
    if (!link || !KEY_TEXT.test(next)) return { ok: false, reason: 'bad', why: WHY.bad };
    if (link.prev) return next === link.key ? { ok: true } : { ok: false, reason: 'bad', why: WHY.bad };
    if (viaPrev || next === link.key) return { ok: false, reason: 'bad', why: WHY.bad };
    const updated = { ...link, key: next, prev: link.key, prevUntil: this.now() + REKEY_GRACE_MS };
    this.link = updated; // first, so the storage change reads as the same link
    this.relay?.setKeys(updated);
    await this.store.rekeyLink(updated).catch(() => {});
    return { ok: true };
  }

  /** Jarvis has switched to the new key: the code's key is forgotten here too. */
  async dropPrevKey() {
    const link = this.link;
    if (!link?.prev) return;
    const updated = { ...link, prev: undefined, prevUntil: undefined };
    delete updated.prev;
    delete updated.prevUntil;
    this.link = updated;
    this.relay?.setKeys(updated);
    await this.store.rekeyLink({ key: updated.key }).catch(() => {});
  }

  /** `open { url, rect, focus }`: see openVerdict. */
  async open(body) {
    const v = openVerdict(body?.url);
    const rect = cleanRect(body?.rect);
    const focus = body?.focus !== false;
    if (!v.ok && v.reason === 'needs-click') {
      this.addCard({ url: v.url, site: v.site, detail: v.detail, rect, focus });
      return { ok: false, reason: 'needs-click', why: v.why };
    }
    if (!v.ok) return { ok: false, reason: v.reason, why: v.why };
    this.holdDownloadsFrom(v.url, v.site);
    await this.openTab(v.url, { rect, focus });
    this.noteOpened(v.site);
    return { ok: true, url: v.url, site: v.site };
  }

  /** For OPEN_HOLD_MS, a download from this address (or its site's pages) waits for a click (LINK-9). */
  holdDownloadsFrom(url, site) {
    const now = this.now();
    this.openHolds = [...this.openHolds.filter((h) => h.until > now), { url, site, until: now + OPEN_HOLD_MS }].slice(-5);
  }

  /**
   * A download that starts while no task runs (controller.holdDownload left it): if it comes, within
   * OPEN_HOLD_MS, from an address opened for Jarvis or a page of its site (a redirect to an installer,
   * a Content-Disposition: attachment), it is held on a card like an address that acts (REDTEAM-LINK-9):
   * saved only on the owner's Save, in the side panel or the approval window. Returns true when held.
   */
  holdDownload(item, suggest) {
    const now = this.now();
    this.openHolds = this.openHolds.filter((h) => h.until > now);
    if (!this.openHolds.length || typeof suggest !== 'function') return false;
    const url = String(item?.url || '');
    const finalUrl = String(item?.finalUrl || url);
    const referrer = String(item?.referrer || '');
    const hold = this.openHolds.find((h) => url === h.url || referrer === h.url || (h.site && (siteOf(url) === h.site || siteOf(referrer) === h.site)));
    if (!hold) return false;
    const name = String(item?.filename || '').split(/[\\/]/).pop() || (() => {
      try {
        return new URL(finalUrl).pathname.split('/').pop() || 'a file';
      } catch {
        return 'a file';
      }
    })();
    const kind = fileKind(name);
    const card = { id: uid('card_'), kind: 'download', url: finalUrl, shown: cardAddress(finalUrl), site: siteOf(finalUrl) || hold.site, name: truncate(name, 120), detail: kind.warn || '', at: now };
    this.heldDownloads.set(card.id, { item, suggest, settled: false });
    this.cards = [...this.cards, card].slice(-5);
    this.sendCards();
    this.showApprovalWindow();
    return true;
  }

  /** The owner's answer to a held download: Save lets Chrome go on; anything else cancels it. */
  async settleDownload(cardId, save) {
    const held = this.heldDownloads.get(cardId);
    if (!held || held.settled) return;
    held.settled = true;
    this.heldDownloads.delete(cardId);
    if (!save) {
      try {
        await this.chrome.downloads?.cancel?.(held.item?.id);
      } catch {
        /* already gone */
      }
    }
    try {
      held.suggest();
    } catch {
      /* Chrome stopped waiting */
    }
  }

  /** The site Jarvis opened by voice counts as "opened by voice" for the task it is part of. */
  noteOpened(site) {
    this.openedSites.set(site, this.now());
    const run = this.controller.run;
    if (run?.task.from === 'voice') run.voiceSites?.add(site);
  }

  /**
   * A tab in the last focused Jarvis-profile window (or a new window), with no debugger: nothing
   * acts there until a task does, and a task asks for the site as always. With `rect` the window
   * goes there and isn't focused (Jarvis stays in front, beside it); without, it is focused.
   */
  async openTab(url, { rect = null, focus = true } = {}) {
    const windows = this.chrome.windows;
    let win = null;
    try {
      win = await windows.getLastFocused({ windowTypes: ['normal'] });
    } catch {
      win = null;
    }
    if (win?.id === undefined || win.id === null) {
      return windows.create({ url, type: 'normal', focused: !rect && focus, ...(rect || {}) });
    }
    const tab = await this.chrome.tabs.create({ windowId: win.id, url, active: true });
    try {
      if (rect) await windows.update(win.id, { state: 'normal', ...rect });
      else if (focus) await windows.update(win.id, { focused: true });
    } catch {
      /* the tab is open all the same */
    }
    return tab;
  }

  addCard({ url, site, detail, rect, focus }) {
    const card = { id: uid('card_'), url, shown: cardAddress(url), site, detail: detail || '', rect, focus, at: this.now() };
    this.cards = [...this.cards.filter((c) => c.url !== url), card].slice(-5);
    this.sendCards();
    this.showApprovalWindow();
    return card;
  }

  /** The owner's click on a card in the side panel or the approval window. */
  async onPanelMessage(msg) {
    if (msg?.type === 'unlink') return this.unlink({ tell: true });
    if (msg?.type !== 'open-card') return;
    const card = this.cards.find((c) => c.id === msg.cardId);
    if (!card) return;
    this.cards = this.cards.filter((c) => c !== card);
    this.sendCards();
    if (card.kind === 'download') return this.settleDownload(card.id, msg.choice === 'save');
    if (msg.choice !== 'open') return;
    // Checked again: what opens is exactly the address the card showed, and still not refused.
    const v = openVerdict(card.url);
    if (!v.ok && v.reason !== 'needs-click') return;
    this.holdDownloadsFrom(card.url, card.site);
    await this.openTab(card.url, { rect: card.rect, focus: card.focus });
    this.noteOpened(card.site);
  }

  /** `start { text, chat, from: 'voice' }`. */
  async startTask(body) {
    const text = typeof body?.text === 'string' ? displayText(body.text).trim() : '';
    if (!text || text.length > MAX_TASK_TEXT) return { ok: false, reason: 'bad', why: WHY.bad };
    const voice = await this.store.getVoice();
    if (!voice.tasksFromJarvis) return { ok: false, reason: 'off', why: WHY.off };
    if (this.controller.run) return { ok: false, reason: 'busy', why: WHY.busy };
    if (!(await this.store.getProfile()) || !(await this.store.getApiKey())) return { ok: false, reason: 'off', why: WHY.setup };
    if ((await this.store.voiceTasksToday(this.now())) >= VOICE_TASKS_PER_DAY) return { ok: false, reason: 'cap', why: WHY.cap };
    if (this.controller.run) return { ok: false, reason: 'busy', why: WHY.busy };
    if (body.chat === 'new') await this.controller.newChat({ clear: false });
    const now = this.now();
    const voiceSites = new Set(namedSites(text));
    for (const [site, at] of this.openedSites) if (now - at < OPENED_SITE_LIFE_MS) voiceSites.add(site);
    this.openedSites.clear();
    let windowId;
    try {
      windowId = (await this.chrome.windows.getLastFocused({ windowTypes: ['normal'] }))?.id;
    } catch {
      windowId = undefined;
    }
    const taskId = uid('task_');
    // The budget the owner heard ("Chrome, up to a dollar: …"): the task never goes past it without asking (MONEY-3).
    const heard = Number(body.limitUsd);
    const budgetCapUsd = Number.isFinite(heard) && heard > 0 && heard <= 1000 ? heard : null;
    const started = await new Promise((resolve) => {
      this.controller
        .start({ text, windowId, from: 'voice', taskId, voiceSites, budgetCapUsd, onStarted: (task) => resolve(task) })
        .catch(() => {})
        .finally(() => resolve(null));
    });
    if (!started) return { ok: false, reason: 'busy', why: WHY.busy };
    await this.store.countVoiceTask(now).catch(() => {});
    this.watch();
    return { ok: true, id: taskId };
  }

  stopTask() {
    const run = this.controller.run;
    if (!run || run.stopping) return { ok: false, reason: 'gone', why: WHY.noTask };
    run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: 'Stopped by voice from Jarvis.', status: 'done' });
    this.controller.stop('jarvis');
    return { ok: true };
  }

  /** What the voice policy reads about the open prompt of `run`. */
  async policyContext(run) {
    const available = await this.approvalsAvailableNow();
    return {
      now: this.now(),
      shownAt: run.prompt?.shownAt ?? this.now(),
      available,
      approvals: approvalsOn((await this.store.getVoice()).approvals, available),
      voiceSites: run.voiceSites || new Set(),
      alwaysSites: await this.store.getSites().catch(() => ({})),
      readElsewhere: (site) => (typeof run.policy?.readElsewhere === 'function' ? run.policy.readElsewhere(site) : true),
    };
  }

  /** `answer { promptId, hash, choice, via }`: taken only as voice-policy.js allows. */
  async answer(body) {
    const run = this.controller.run;
    const p = run?.task.prompt;
    if (!run || !p || !run.prompt || typeof body?.promptId !== 'string' || p.id !== body.promptId) return { ok: false, reason: 'gone', why: WHY.gone };
    if (typeof body.hash !== 'string' || body.hash !== (await promptHash(p))) return { ok: false, reason: 'refused', why: WHY.changed };
    const verdict = voiceDecision(p, run.prompt.facts, body.choice, await this.policyContext(run));
    if (!verdict.ok) return { ok: false, reason: verdict.reason, why: verdict.why };
    // (The prompt may have closed while the policy read the settings.)
    if (this.controller.run !== run || run.task.prompt !== p) return { ok: false, reason: 'gone', why: WHY.gone };
    if (!this.controller.decideFromJarvis(p.id, body.choice, { via: body.via === 'card' ? 'card' : 'voice' })) return { ok: false, reason: 'gone', why: WHY.gone };
    return { ok: true, promptId: p.id };
  }

  // -------------------------------------------------------------------------------------------
  // To Jarvis

  async statusBody() {
    const voice = await this.store.getVoice().catch(() => ({ tasksFromJarvis: false }));
    const run = this.controller.run;
    // (`from` since the review: Jarvis tells a task it started from one typed in the panel, MISSED-LINK-A.)
    return { online: true, tasksFromJarvis: voice.tasksFromJarvis, voiceApprovals: await this.approvals().catch(() => false), task: run ? { id: run.task.id, status: run.task.status, from: run.task.from === 'voice' ? 'voice' : 'panel' } : null, ...(await this.budgetFields()) };
  }

  /** `status` when it changed (or `force`), and every 60 s while a task runs. */
  async sendStatus({ force = false } = {}) {
    if (!this.relay) return;
    const body = await this.statusBody();
    const sig = JSON.stringify(body);
    if (!force && sig === this.statusSig && this.now() - (this.statusAt || 0) < STATUS_EVERY_MS) return;
    this.statusSig = sig;
    this.statusAt = this.now();
    await this.send('status', body);
  }

  /**
   * Every prompt the side panel shows goes to Jarvis too, with what it may say and whether voice
   * may answer it. (Called as the prompt appears: its message is queued before anything after it.)
   */
  onPrompt(run, prompt, facts) {
    const summary = this.policyContext(run).then(
      (ctx) => voiceSummary(prompt, facts, ctx),
      () => ({ allowed: false, why: '' }),
    );
    this.send('prompt', async () => {
      const f = promptFields(prompt);
      return { promptId: prompt.id, hash: await promptHash(prompt), kind: f.kind, category: f.category, consequential: !!prompt.consequential, site: f.site, title: f.title, spoken: spokenLine(prompt, facts), body: f.body, address: f.address, choices: f.choices, voice: await summary };
    });
    // Nobody may be at the side panel: a question that needs a click opens a window of its own.
    return summary.then((voice) => {
      if (run.task.from === 'voice' && !voice.allowed) return this.showApprovalWindow();
    });
  }

  onTask(task) {
    if (!this.relay) return;
    // (The status changes with the running task and its status; the switches send it themselves.)
    const run = this.controller.run;
    const sig = run ? `${run.task.id}|${run.task.status}` : '';
    if (sig !== this.runSig) {
      this.runSig = sig;
      this.sendStatus().catch(() => {});
    }
    if (!FINAL_STATUSES.has(task.status)) this.watch();
    if (task.from !== 'voice') return;
    if (FINAL_STATUSES.has(task.status)) {
      this.flushTask(task);
      if (!this.doneSent.has(task.id)) {
        this.doneSent.add(task.id);
        this.send('done', { id: task.id, status: doneStatus(task), answer: truncate(task.answer || task.error || '', MAX_ANSWER), costUsd: task.cost || 0 });
      }
      return;
    }
    const last = this.sentTask.get(task.id);
    if (!last || last.status !== task.status) return this.flushTask(task);
    if (this.taskTimer) return;
    this.taskTimer = setTimeout(() => {
      this.taskTimer = null;
      const run = this.controller.run;
      if (run?.task.id === task.id) this.flushTask(run.task);
    }, Math.max(0, TASK_EVERY_MS - (this.now() - last.at)));
  }

  flushTask(task) {
    const lastStep = [...task.steps].reverse().find((s) => s.kind === 'action' || s.kind === 'notice' || s.kind === 'ask' || s.kind === 'warning');
    this.sentTask.set(task.id, { status: task.status, at: this.now() });
    if (this.sentTask.size > 50) this.sentTask.delete(this.sentTask.keys().next().value);
    this.send('task', {
      id: task.id,
      status: task.status,
      text: truncate(task.text, MAX_TASK_TEXT),
      narration: truncate(task.narration || '', 500),
      lastStep: truncate(lastStep?.label || '', 300),
      costUsd: task.cost || 0,
      limitUsd: task.limits?.budgetLimit ?? null,
      from: 'voice',
    });
  }

  // -------------------------------------------------------------------------------------------
  // While a task runs: the status every 60 s, and the watch on the relay for a task from Jarvis

  watch() {
    if (this.watchTimer) return;
    this.watchTimer = setInterval(() => this.checkRelay(), 1000);
  }

  /**
   * A task from Jarvis pauses itself (as Take over does) once Jarvis's box hasn't been read for
   * UNREACHABLE_MS (REDTEAM-LINK-3: reads, not the extension's own posts): a Stop said to Jarvis
   * could be lost on the way. Once per outage: if the owner presses Continue in the side panel, it
   * goes on.
   */
  checkRelay() {
    const run = this.controller.run;
    if (!run || FINAL_STATUSES.has(run.task.status)) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
      return;
    }
    if (this.relay && this.now() - (this.statusAt || 0) >= STATUS_EVERY_MS) this.sendStatus({ force: true }).catch(() => {});
    const relay = this.relay;
    if (!relay || run.task.from !== 'voice' || run.takeover || run.stopping) return;
    const now = this.now();
    if (relay.unreadFor(now) < UNREACHABLE_MS) return;
    if (run.relayPausedAt && relay.lastReadAt <= run.relayPausedAt) return;
    run.relayPausedAt = now;
    run.task.steps.push({ id: uid('s'), at: now, kind: 'notice', level: 'warn', label: 'Paused: Jarvis for Chrome couldn’t reach your home base for 20 seconds, so a Stop said to Jarvis might not arrive. Press Continue here to go on, or Stop.', status: 'done' });
    this.controller.takeover();
  }

  /**
   * The link ended (Unlink, `unlinked` from Jarvis) or changed (a new link) while a task from Jarvis
   * runs: nothing can bring its Stop any more, so it pauses as Take over does (REDTEAM-LINK-3).
   */
  pauseForLinkEnd() {
    const run = this.controller.run;
    if (!run || run.task.from !== 'voice' || run.takeover || run.stopping || FINAL_STATUSES.has(run.task.status)) return;
    run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: 'Paused: the link with Jarvis ended, so a Stop said to Jarvis can’t arrive. Press Continue here to go on, or Stop.', status: 'done' });
    this.controller.takeover();
  }

  // -------------------------------------------------------------------------------------------
  // The approval window (when no side panel is open)

  /** Opens the approval window, or brings it to the front (one at a time, also when asked twice at once). */
  showApprovalWindow() {
    if (this.controller.hasPanel()) return Promise.resolve();
    if (!this.windowOpening) {
      this.windowOpening = this.openApprovalWindow().finally(() => {
        this.windowOpening = null;
      });
    }
    return this.windowOpening;
  }

  async openApprovalWindow() {
    const windows = this.chrome.windows;
    if (this.approvalWindowId !== null) {
      try {
        await windows.update(this.approvalWindowId, { focused: true });
        return;
      } catch {
        this.approvalWindowId = null;
      }
    }
    try {
      const w = await windows.create({ url: this.chrome.runtime.getURL('approve.html'), type: 'popup', focused: true, ...APPROVAL_WINDOW });
      this.approvalWindowId = w?.id ?? null;
    } catch {
      /* the badge still says Jarvis waits */
    }
  }

  onWindowRemoved(windowId) {
    if (windowId === this.approvalWindowId) this.approvalWindowId = null;
  }
}
