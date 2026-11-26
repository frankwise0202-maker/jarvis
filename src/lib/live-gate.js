// The live view's $1 an hour, for answers too (v8.1, E0): pure (no DOM, no network; the clock, the
// storage and the lock are injected). v8.0's createLiveBudget (src/lib/live-view.js) keeps what was
// spent in the hour, shared by every Jarvis tab and window through localStorage. This adds
// reservations, kept in the same storage: before each main-model request sent while the live view
// is on (a Look, a follow-up, a quick research answer, and each later request of that turn), its
// worst case is reserved; if the hour's spending, every window's reservations and this one would
// pass the cap, the request is not sent. After it, the real cost replaces the reservation.
//
//   GATE_LIMITS            max_tokens 4,000 for a turn's first request and 1,000 for later ones;
//                          $0.01 for each web search a request may make
//   gateMaxTokens(first)   4,000 | 1,000
//   estimateInputTokens(params)
//                          a request's input in tokens (system, tools, messages; images from their
//                          real size), on the high side
//   requestWorstUsd(params) the worst case of one request: its input at the cache-write price,
//                          max_tokens at the output price, and $0.01 per web search it may make
//   createLiveGate({ budget, storage, now, lock })
//                          { budget, reserve(usd), settle(id, usd), release(id), keep(id), count(usd),
//                            reserved(), fits(usd), resumeAt(usd) }
//   capLine(resumeAt)      "That would take the live view past its dollar this hour. It can go on at
//                          2:41 PM, or say 'stop live view' and ask again."
//   createTurnGate({ gate, isOn })
//                          the object the engine's startTurn({ gate }) consults before each request
//                          of one turn (make one per turn): while the live view is on it keeps each
//                          request short, reserves it and refuses it at the edge; once a request of
//                          the turn went out that way, the rest of the turn is counted too (v8.0's
//                          rule: a question asked during the live view counts in full)

import { WEB_SEARCH_USD, priceOf } from '../engine/models.js';
import { imageSizeOf, imageTokens } from './optics.js';
import { liveResumeShownAt } from './live-view.js';

export const GATE_LIMITS = Object.freeze({
  firstMaxTokens: 4000, // a Look writes about 450 (lib/optics.js estimateLookCost)
  laterMaxTokens: 1000, // the closing sentence after its labels, a continuation
  searchUsd: WEB_SEARCH_USD,
});

/** Where each window keeps its open reservations: one key per window, so no window overwrites another's. */
export const LIVE_RESERVED_PREFIX = 'jarvis.liveView.reserved.';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** max_tokens of a request sent while the live view is on: 4,000 for a turn's first, 1,000 after. */
export function gateMaxTokens(first) {
  return first ? GATE_LIMITS.firstMaxTokens : GATE_LIMITS.laterMaxTokens;
}

// ---------------------------------------------------------------------------------------------
// The worst case of one request

// Text and JSON at 3 characters a token: on the high side for the newest tokenizers (they count
// about 30% more than the older 4), as the live view's own estimate assumes.
const CHARS_PER_TOKEN = 3;
const MESSAGE_TOKENS = 5; // each message's own framing
const IMAGE_MAX_TOKENS = 4784; // the high-resolution cap (lib/optics.js imageTokens)
const DOCUMENT_MIN_TOKENS = 1500; // a PDF page, about

const charsOf = (v) => (typeof v === 'string' ? v.length : v === undefined || v === null ? 0 : JSON.stringify(v).length);

/** Tokens of one image block: from the picture's real size when its header can be read, else the cap. */
function imageBlockTokens(block) {
  const src = block && block.source;
  if (src && src.type === 'base64' && typeof src.data === 'string') {
    const size = imageSizeOf(src.data);
    if (size) return imageTokens(size.width, size.height);
  }
  return IMAGE_MAX_TOKENS;
}

/** Tokens of a document (a PDF: text and a picture per page): about one per 20 bytes, at least a page. */
function documentBlockTokens(block) {
  const src = block && block.source;
  if (src && src.type === 'base64' && typeof src.data === 'string') return Math.max(DOCUMENT_MIN_TOKENS, Math.ceil((src.data.length * 0.75) / 20));
  if (src && src.type === 'text' && typeof src.data === 'string') return Math.ceil(src.data.length / CHARS_PER_TOKEN);
  return DOCUMENT_MIN_TOKENS;
}

function blockTokens(block) {
  if (typeof block === 'string') return Math.ceil(block.length / CHARS_PER_TOKEN);
  if (!block || typeof block !== 'object') return 0;
  switch (block.type) {
    case 'text':
      return Math.ceil(charsOf(block.text) / CHARS_PER_TOKEN);
    case 'image':
      return imageBlockTokens(block);
    case 'document':
      return documentBlockTokens(block);
    case 'thinking':
      return Math.ceil((charsOf(block.thinking) + charsOf(block.signature)) / CHARS_PER_TOKEN);
    case 'tool_result': {
      const c = block.content;
      const inner = Array.isArray(c) ? c.reduce((n, b) => n + blockTokens(b), 0) : Math.ceil(charsOf(c) / CHARS_PER_TOKEN);
      return inner + 10;
    }
    default:
      // tool_use (its input), server tool calls and their results, anything new: their JSON.
      return Math.ceil(charsOf(block) / CHARS_PER_TOKEN);
  }
}

/**
 * The input of a request (`params` as sent: system, tools, messages) in tokens, on the high side:
 * text and JSON at 3 characters a token, each picture from its real size (one token per 28 × 28
 * pixels, read from the JPEG or PNG header), a PDF at about one token per 20 bytes.
 */
export function estimateInputTokens(params) {
  const p = params && typeof params === 'object' ? params : {};
  let tokens = 0;
  const sys = p.system;
  if (Array.isArray(sys)) for (const b of sys) tokens += blockTokens(b);
  else if (typeof sys === 'string') tokens += Math.ceil(sys.length / CHARS_PER_TOKEN);
  if (Array.isArray(p.tools) && p.tools.length) tokens += Math.ceil(charsOf(p.tools) / CHARS_PER_TOKEN);
  for (const m of Array.isArray(p.messages) ? p.messages : []) {
    tokens += MESSAGE_TOKENS;
    const c = m && m.content;
    if (Array.isArray(c)) for (const b of c) tokens += blockTokens(b);
    else tokens += Math.ceil(charsOf(c) / CHARS_PER_TOKEN);
  }
  return tokens;
}

/** How many web searches a request may make: its web_search tool's max_uses (none without the tool). */
export function allowedSearches(tools) {
  if (!Array.isArray(tools)) return 0;
  const t = tools.find((x) => x && typeof x === 'object' && (x.name === 'web_search' || String(x.type || '').startsWith('web_search')));
  if (!t) return 0;
  return isNum(t.max_uses) && t.max_uses >= 0 ? Math.floor(t.max_uses) : 10;
}

/**
 * The worst case of one request, in USD: all of its input at the 5-minute cache-write price (the
 * prompt cache may be cold), all of max_tokens at the output price, and $0.01 for every web search
 * it may make. `model`: the model it goes to (default: params.model).
 */
export function requestWorstUsd(params, { model } = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const price = priceOf(model || p.model);
  const out = isNum(p.max_tokens) && p.max_tokens > 0 ? p.max_tokens : 0;
  return (estimateInputTokens(p) * price.cacheWrite5mPerM + out * price.outPerM) / 1e6 + allowedSearches(p.tools) * GATE_LIMITS.searchUsd;
}

// ---------------------------------------------------------------------------------------------
// The gate: reservations beside v8.0's budget

const NANO = 1e9;
const nano = (usd) => (isNum(usd) && usd > 0 ? Math.ceil(usd * NANO - 1e-6) : 0);
const randomTag = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

/** A window's reservations as stored: [{ id, t, usd }]; anything unreadable is skipped. */
function parseReserved(raw) {
  if (typeof raw !== 'string' || !raw) return [];
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const t = Number(e.t);
    const n = nano(Number(e.usd));
    if (!Number.isFinite(t) || n <= 0) continue;
    out.push({ id: typeof e.id === 'string' ? e.id.slice(0, 64) : '', t, nano: n });
  }
  return out;
}

/**
 * The live view's gate over v8.0's `budget` (createLiveBudget: the hour's spending, shared through
 * `storage`). Each window keeps its open reservations under its own key in the same storage
 * (LIVE_RESERVED_PREFIX + a tag), so every window sees every other's, and none can drop another's.
 *
 *   reserve(usd)      reserves `usd` now when the hour's spending, every window's reservations and
 *                     `usd` stay within the cap: { ok: true, id }; else { ok: false, resumeAt }
 *                     (when it would fit if nothing more were spent; Infinity: never this hour).
 *                     Through `lock` when given (a Web Lock across windows), so two windows can't
 *                     both take the last room.
 *   settle(id, usd)   the request was answered: its real cost goes to the budget, its reservation goes
 *   release(id)       it failed before it was billed: the reservation goes
 *   keep(id)          it was stopped after it was sent (it may have been billed): the reservation
 *                     is counted as spent
 *   count(usd)        real money with no reservation (a request of a counted turn sent after the
 *                     live view stopped: nothing to refuse, but it counts)
 *   reserved()        USD reserved now by every window (open reservations in the hour)
 *   fits(usd)         whether `usd` more fits now, reservations included (the live view's own looks)
 *   resumeAt(usd)     budget.resumeAt() with the reservations included
 *
 * A reservation never settled (the window was closed mid-request) counts until it is an hour old,
 * like spending: the worst is assumed. Without storage the gate works for this window alone.
 */
export function createLiveGate({ budget, storage = null, now = Date.now, lock = null, keyPrefix = LIVE_RESERVED_PREFIX, instance = randomTag() } = {}) {
  if (!budget || typeof budget.canSpend !== 'function') throw new TypeError('createLiveGate: budget is required');
  const windowMs = isNum(budget.windowMs) && budget.windowMs > 0 ? budget.windowMs : 3600000;
  const clock = typeof now === 'function' ? now : Date.now;
  const store = storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' ? storage : null;
  const canList = !!store && typeof store.key === 'function';
  const ownKey = `${keyPrefix}${instance}`;
  const mine = new Map(); // id → { id, t, nano }: this window's open reservations
  let seq = 0;
  const time = () => {
    const v = Number(clock());
    return Number.isFinite(v) ? v : Date.now();
  };
  const run = (fn) => (typeof lock === 'function' ? Promise.resolve(lock(fn)) : Promise.resolve().then(fn));

  function writeOwn() {
    if (!store) return;
    try {
      if (mine.size) store.setItem(ownKey, JSON.stringify([...mine.values()].map((e) => ({ id: e.id, t: e.t, usd: e.nano / NANO }))));
      else if (typeof store.removeItem === 'function') store.removeItem(ownKey);
      else store.setItem(ownKey, '[]');
    } catch {
      /* full or blocked storage: this window still counts its own */
    }
  }

  function keys() {
    const out = [];
    if (!canList) return out;
    try {
      const n = Number(store.length) || 0;
      for (let i = 0; i < n; i++) {
        const k = store.key(i);
        if (typeof k === 'string' && k.startsWith(keyPrefix)) out.push(k);
      }
    } catch {
      /* unreadable */
    }
    return out;
  }

  /** Nano-dollars reserved now by every window (this one from memory, the others from storage). */
  function reservedNano(t) {
    for (const [id, e] of mine) if (t - e.t >= windowMs) mine.delete(id);
    let sum = 0;
    for (const e of mine.values()) sum += e.nano;
    const stale = [];
    for (const k of keys()) {
      if (k === ownKey) continue;
      let raw = null;
      try {
        raw = store.getItem(k);
      } catch {
        raw = null;
      }
      const list = parseReserved(raw);
      let open = 0;
      for (const e of list) if (t - Math.min(e.t, t) < windowMs) open += e.nano;
      sum += open;
      if (!open) stale.push(k); // a closed window's reservations, all over an hour old (or none)
    }
    for (const k of stale) {
      try {
        store.removeItem(k);
      } catch {
        /* ignore */
      }
    }
    return sum;
  }

  const reservedUsd = (t = time()) => reservedNano(t) / NANO;

  function tryReserve(usd) {
    const t = time();
    const n = nano(usd);
    // The reservations first, then the budget: a reservation settled meanwhile is then counted
    // twice (safe), never not at all.
    const held = reservedUsd(t);
    if (!budget.canSpend(held + n / NANO)) return { ok: false, resumeAt: budget.resumeAt(held + n / NANO) };
    seq += 1;
    const id = `${instance}.${seq}`;
    if (n > 0) {
      mine.set(id, { id, t, nano: n });
      writeOwn();
    }
    return { ok: true, id };
  }

  function drop(id) {
    const e = mine.get(id);
    if (!e) return null;
    mine.delete(id);
    writeOwn();
    return e;
  }

  return {
    key: ownKey,
    /** v8.0's budget this gate reserves beside (the live view's own looks add to it). */
    budget,
    reserve: (usd) => run(() => tryReserve(usd)),
    settle: (id, usd) =>
      run(() => {
        if (!mine.has(id)) return false;
        // Spent first, then the reservation goes: another window never sees neither.
        if (nano(usd) > 0) budget.add(usd);
        drop(id);
        return true;
      }),
    release: (id) => run(() => !!drop(id)),
    keep: (id) =>
      run(() => {
        const e = mine.get(id);
        if (!e) return false;
        budget.add(e.nano / NANO);
        drop(id);
        return true;
      }),
    count: (usd) =>
      run(() => {
        if (nano(usd) <= 0) return false;
        budget.add(usd);
        return true;
      }),
    reserved: () => reservedUsd(),
    fits: (usd) => {
      const held = reservedUsd();
      return budget.canSpend(held + nano(usd) / NANO);
    },
    resumeAt: (usd) => {
      const held = reservedUsd();
      return budget.resumeAt(held + nano(usd) / NANO);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// What Jarvis says at the edge, and the engine's side

/** "2:41 PM" (the device's clock style), rounded up to the minute like the live view's own note. */
function defaultTime(at) {
  try {
    return new Date(liveResumeShownAt(at)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * The line a request refused at the edge ends its turn with: "That would take the live view past
 * its dollar this hour. It can go on at 2:41 PM, or say 'stop live view' and ask again." Without a
 * time (`resumeAt` Infinity: not this hour): "… Say 'stop live view' and ask again."
 */
export function capLine(resumeAt, { formatTime = defaultTime } = {}) {
  const head = 'That would take the live view past its dollar this hour.';
  const when = isNum(resumeAt) ? formatTime(resumeAt) : '';
  return when ? `${head} It can go on at ${when}, or say 'stop live view' and ask again.` : `${head} Say 'stop live view' and ask again.`;
}

/**
 * What the engine consults before each lead request of a turn (startTurn({ gate }), lead.js). One per
 * turn (it remembers whether the turn has counted toward the live view's hour).
 *   maxTokens(first)   null while the live view is off (the request goes out as usual), else 4,000
 *                      for the turn's first request and 1,000 for later ones
 *   reserve({ params, model }) → null (nothing to do: the live view is off and this turn never went
 *                      through it), { refused: true, message } (don't send: the turn ends with
 *                      `message`), or a ticket { usd, settle(cost), release(), keep(partialCost) }.
 *                      A turn that sent a request while the live view was on keeps counting after it
 *                      stops (v8.0's rule: a question asked during the live view counts in full):
 *                      its later requests get a ticket of 0 that counts their real cost.
 * `isOn()`: whether the live view is on in this window now (paused counts as on).
 */
export function createTurnGate({ gate, isOn }) {
  const on = () => {
    try {
      return !!isOn();
    } catch {
      return false;
    }
  };
  let counting = false;
  return {
    maxTokens: (first) => (on() ? gateMaxTokens(first) : null),
    get counting() {
      return counting;
    },
    async reserve({ params, model } = {}) {
      if (!on()) {
        if (!counting) return null;
        // The live view stopped during this turn: nothing to keep short or refuse, but it counts.
        let done = false;
        const finish = (usd) => {
          if (done) return undefined;
          done = true;
          return Number(usd) > 0 ? gate.count(Number(usd)) : undefined;
        };
        return { usd: 0, settle: (cost) => finish(cost), release: () => finish(0), keep: (partial) => finish(partial) };
      }
      counting = true;
      const usd = requestWorstUsd(params, { model });
      const r = await gate.reserve(usd);
      if (!r || !r.ok) return { refused: true, message: capLine(r ? r.resumeAt : Infinity), usd };
      // One outcome per ticket: answered, failed before billing, or stopped after it was sent.
      let done = false;
      const finish = (fn) => {
        if (done) return undefined;
        done = true;
        return fn();
      };
      return {
        usd,
        settle: (cost) => finish(() => gate.settle(r.id, Number(cost) || 0)),
        release: () => finish(() => gate.release(r.id)),
        keep: () => finish(() => gate.keep(r.id)),
      };
    },
  };
}
