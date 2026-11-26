// The live view's $1 an hour, for answers too (v8.1, E0): pure (no DOM, no network; the clock, the
// storage and the lock are injected). v8.0's createLiveBudget (src/lib/live-view.js) keeps what was
// spent in the hour, shared by every Jarvis tab and window through localStorage. This adds
// reservations, kept in the same storage: before each main-model request of a turn asked while the
// live view is on (a Look, a follow-up, a quick research answer, and each later request of that
// turn), its worst case is reserved, or what is left of the hour when that covers the input and a
// useful answer (max_tokens then comes down to fit); with less room than that the request is not
// sent. While it streams, a meter follows what it costs and, while the hour has room, grows what is
// held for it; it stops the request only when the hour can't hold its next round, or before it
// fetches a page (v8.1.1, MONEY-R2-1). After it, the real cost replaces the reservation; a request
// stopped or cut after it was sent counts at most what it may have cost (MONEY-R2-3).
//
//   GATE_LIMITS            max_tokens 4,000 for a turn's first request and 1,000 for later ones;
//                          $0.01 for each web search; the web budget of such a turn (2 searches, no
//                          page fetches), a search's results at 4,000 tokens at least
//   LIVE_WEB               { searches: 2, fetches: 0 }: what a turn asked during the live view is
//                          told it may use (gateNote), and what its requests reserve for
//   gateNote               the line its turn context carries, asking for that budget
//   gateMaxTokens(first)   4,000 | 1,000
//   estimateInputTokens(params)
//                          a request's input in tokens (system, tools, messages; images from their
//                          real size), on the high side
//   requestWorstUsd(params, { model, web })
//                          the worst case of one request: its input at the cache-write price, all of
//                          max_tokens at the output price, and for each web search (or fetched page)
//                          it may make, $0.01 plus its results written to the cache and every later
//                          round reading what came before again from the cache
//   requestFloorUsd(params, { model })
//                          the least worth sending: the input and a useful answer (1,000 tokens)
//   fitRequest(params, { model, web, usd })
//                          { maxTokens, web } that keep the worst case within `usd`, or null
//   createLiveGate({ budget, storage, now, lock })
//                          { budget, reserve(usd), reserveUpTo(usd, floorUsd), extend(id, usd),
//                            settle(id, usd), settleAtMost(id, usd), release(id), keep(id),
//                            count(usd), reserved(), room(), fits(usd), resumeAt(usd) }
//   capLine(resumeAt)      "That would take the live view past its dollar this hour. It can go on at
//                          2:41 PM, or say 'stop live view' and ask again."
//   FETCH_LINE             the line of an answer stopped before it fetches a page (not the cap line)
//   createRequestMeter({ model, maxTokens, limitUsd, web, tools, canGrow, grow, onStop })
//                          the running estimate of one request from its stream events: onEvent(event)
//                          says when it must stop
//   createTurnGate({ gate, isOn, startedOn })
//                          the object the engine's startTurn({ gate }) consults before each request
//                          of one turn (make one per turn, when the turn starts): a turn asked while
//                          the live view is on keeps each request short, reserves it and refuses it
//                          at the edge, and is counted in full even after the live view stops
//                          (v8.0's rule); a turn asked while it was off is never touched, even if
//                          the live view starts before it ends
//   resumeTurnGate({ gate, isOn, turn })
//                          the gate of a resumed turn: the decision recorded when it was asked
//                          (turn.liveGated, MONEY-R2-2)

import { WEB_SEARCH_USD, priceOf } from '../engine/models.js';
import { imageSizeOf, imageTokens } from './optics.js';
import { liveResumeShownAt } from './live-view.js';

export const GATE_LIMITS = Object.freeze({
  firstMaxTokens: 4000, // a Look writes about 450 (lib/optics.js estimateLookCost)
  laterMaxTokens: 1000, // the closing sentence after its labels, a continuation
  searchUsd: WEB_SEARCH_USD,
  // The web budget of a turn asked during the live view. The conversation's tools stay as they are
  // (a changed tool list would make the API drop or refuse the earlier thinking and write the whole
  // prompt cache again): the turn context asks for this, the reservation holds it, and the meter
  // stops a request that goes beyond what was reserved.
  searches: 2,
  fetches: 0,
  searchTokens: 4000, // a search's results, at least (their snippets come encrypted)
  searchExpectedTokens: 8000, // what a running search is counted ahead at (MONEY-R2-1: about a real one)
  fetchTokens: 25000, // a page fetched with no max_content_tokens (a PDF is never capped)
  usefulTokens: 1000, // the least output worth sending a request for
});

/** What a turn asked while the live view is on may use of the web, and what its requests reserve for. */
export const LIVE_WEB = Object.freeze({ searches: GATE_LIMITS.searches, fetches: GATE_LIMITS.fetches });

/** The turn context line of a turn asked while the live view is on (startTurn adds the gate's turnNote). */
export const gateNote = `Live view: the owner's camera live view is on, and this answer counts toward its $1 an hour. Keep it short, use at most ${LIVE_WEB.searches} web searches, and do not use web_fetch.`;

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

function webTool(tools, name) {
  if (!Array.isArray(tools)) return null;
  return tools.find((x) => x && typeof x === 'object' && (x.name === name || String(x.type || '').startsWith(name))) || null;
}

/** How many web searches a request may make: its web_search tool's max_uses (none without the tool). */
export function allowedSearches(tools) {
  const t = webTool(tools, 'web_search');
  if (!t) return 0;
  return isNum(t.max_uses) && t.max_uses >= 0 ? Math.floor(t.max_uses) : 10;
}

/** How many pages a request may fetch: its web_fetch tool's max_uses (none without the tool). */
export function allowedFetches(tools) {
  const t = webTool(tools, 'web_fetch');
  if (!t) return 0;
  return isNum(t.max_uses) && t.max_uses >= 0 ? Math.floor(t.max_uses) : 10;
}

/** What one fetched page may add, in tokens: its tool's max_content_tokens (a PDF is not capped by it). */
export function fetchTokensOf(tools) {
  const t = webTool(tools, 'web_fetch');
  return t && isNum(t.max_content_tokens) && t.max_content_tokens > 0 ? Math.floor(t.max_content_tokens) : GATE_LIMITS.fetchTokens;
}

/** The web budget a worst case counts: `web` ({ searches, fetches }) within what the tools allow, else the tools' own. */
function webBudget(tools, web) {
  const maxS = allowedSearches(tools);
  const maxF = allowedFetches(tools);
  const pick = (v, max) => (isNum(v) ? Math.min(max, Math.max(0, Math.floor(v))) : max);
  return { searches: pick(web && web.searches, maxS), fetches: pick(web && web.fetches, maxF), fetchTokens: fetchTokensOf(tools) };
}

/**
 * The worst case in USD of a request with `input` tokens, `out` max_tokens and web budget `b`, priced
 * as the API bills server tools: each search costs $0.01, each result is written to the prompt cache
 * (the API inserts a cache write after tool results) and every later round reads what came before
 * again from the cache. Its parts: { fixed: without output, perOut: per max_tokens token }.
 */
function worstParts(input, b, price) {
  const write = price.cacheWrite5mPerM / 1e6;
  const read = price.cacheReadPerM / 1e6;
  const results = b.searches * GATE_LIMITS.searchTokens + b.fetches * b.fetchTokens;
  const rounds = b.searches + b.fetches;
  const fixed = input * write + results * write + rounds * (input + results) * read + b.searches * GATE_LIMITS.searchUsd;
  // The output, and with tool rounds what it wrote read again: written to the cache once, then read.
  const perOut = price.outPerM / 1e6 + (rounds ? write + rounds * read : 0);
  return { fixed, perOut };
}

/**
 * The worst case of one request, in USD: all of its input at the 5-minute cache-write price (the
 * prompt cache may be cold), all of max_tokens at the output price, and for every web search it may
 * make $0.01 plus its results (4,000 tokens at least) and for every page it may fetch the page (its
 * max_content_tokens), each written to the cache, with every later round reading what came before
 * again from the cache. `model`: the model it goes to (default: params.model). `web`: { searches,
 * fetches } it may use (default: what its tools allow).
 */
export function requestWorstUsd(params, { model, web } = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const price = priceOf(model || p.model);
  const out = isNum(p.max_tokens) && p.max_tokens > 0 ? p.max_tokens : 0;
  const { fixed, perOut } = worstParts(estimateInputTokens(p), webBudget(p.tools, web), price);
  return fixed + out * perOut;
}

/** The least worth sending: the request's input at the cache-write price and a useful answer (1,000 tokens). */
export function requestFloorUsd(params, { model } = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const price = priceOf(model || p.model);
  const max = isNum(p.max_tokens) && p.max_tokens > 0 ? p.max_tokens : GATE_LIMITS.usefulTokens;
  return (estimateInputTokens(p) * price.cacheWrite5mPerM + Math.min(GATE_LIMITS.usefulTokens, max) * price.outPerM) / 1e6;
}

/**
 * The request made to fit `usd`: the most of its max_tokens (at least a useful answer's) and of its
 * web budget (`web`, fewer searches before less output) whose worst case stays within it.
 * Returns { maxTokens, web: { searches, fetches } }, or null when not even a useful answer fits.
 */
export function fitRequest(params, { model, web, usd } = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const price = priceOf(model || p.model);
  const max = isNum(p.max_tokens) && p.max_tokens > 0 ? Math.floor(p.max_tokens) : 0;
  const input = estimateInputTokens(p);
  const full = webBudget(p.tools, web);
  const useful = Math.min(GATE_LIMITS.usefulTokens, max);
  if (!max || !isNum(usd)) return null;
  for (let s = full.searches; s >= 0; s -= 1) {
    const b = { ...full, searches: s, fetches: s === full.searches ? full.fetches : 0 };
    const { fixed, perOut } = worstParts(input, b, price);
    const fits = Math.min(max, Math.floor((usd - fixed) / perOut));
    if (fits >= useful && fits > 0) return { maxTokens: fits, web: { searches: b.searches, fetches: b.fetches } };
  }
  return null;
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
 *   extend(id, usd)   MONEY-R2-1: the reservation grows by `usd` when the hour still holds it
 *   settleAtMost(id, usd)
 *                     MONEY-R2-3: stopped or cut after it was sent, with `usd` an upper bound of what it
 *                     may have cost (its meter's): that counts as spent, up to what the hour can still
 *                     hold (what was held and the room beside it, MONEY-R3-1); the reservation goes
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

  function hold(t, n) {
    seq += 1;
    const id = `${instance}.${seq}`;
    if (n > 0) {
      mine.set(id, { id, t, nano: n });
      writeOwn();
    }
    return { ok: true, id, usd: n / NANO };
  }

  function tryReserve(usd) {
    const t = time();
    const n = nano(usd);
    // The reservations first, then the budget: a reservation settled meanwhile is then counted
    // twice (safe), never not at all.
    const held = reservedUsd(t);
    if (!budget.canSpend(held + n / NANO)) return { ok: false, resumeAt: budget.resumeAt(held + n / NANO) };
    return hold(t, n);
  }

  /** USD left in the hour now: the cap less the hour's spending and every window's reservations. */
  function roomUsd(t = time()) {
    const cap = isNum(budget.capUsd) && budget.capUsd >= 0 ? budget.capUsd : 1;
    const spent = typeof budget.spent === 'function' ? Number(budget.spent()) || 0 : 0;
    return Math.max(0, cap - spent - reservedUsd(t));
  }

  // `usd` when it fits; else all that is left, when that is at least `floorUsd`; else refused.
  function tryReserveUpTo(usd, floorUsd) {
    const t = time();
    const want = nano(usd);
    const held = reservedUsd(t);
    if (budget.canSpend(held + want / NANO)) return hold(t, want);
    const floor = Math.min(want, nano(floorUsd));
    // A nano-dollar short of the room, so rounding never takes it past the cap.
    const room = Math.floor(roomUsd(t) * NANO) - 1;
    if (room > 0 && room >= floor && budget.canSpend(held + room / NANO)) return hold(t, room);
    return { ok: false, resumeAt: budget.resumeAt(held + Math.max(floor, 1) / NANO) };
  }

  // MONEY-R2-1: a reservation grows by `usd` when the hour (every window's spending and reservations,
  // this one included) still holds it: { ok, usd: what it holds now } | { ok: false, resumeAt }.
  function tryExtend(id, usd) {
    const e = mine.get(id);
    if (!e) return { ok: false, resumeAt: Infinity };
    const t = time();
    const extra = nano(usd);
    const held = reservedUsd(t);
    if (!budget.canSpend(held + extra / NANO)) return { ok: false, resumeAt: budget.resumeAt(held + extra / NANO) };
    e.nano += extra;
    writeOwn();
    return { ok: true, usd: e.nano / NANO };
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
    /** { ok, id, usd }: `usd`, or all that is left when that is at least `floorUsd`; else { ok: false, resumeAt }. */
    reserveUpTo: (usd, floorUsd = usd) => run(() => tryReserveUpTo(usd, floorUsd)),
    room: () => roomUsd(),
    settle: (id, usd) =>
      run(() => {
        if (!mine.has(id)) return false;
        // Spent first, then the reservation goes: another window never sees neither.
        if (nano(usd) > 0) budget.add(usd);
        drop(id);
        return true;
      }),
    release: (id) => run(() => !!drop(id)),
    /** MONEY-R2-1: grow reservation `id` by `usd` when the hour holds it ({ ok, usd } | { ok: false, resumeAt }). */
    extend: (id, usd) => run(() => tryExtend(id, usd)),
    /**
     * MONEY-R2-3: a request stopped or cut after it was sent, whose upper bound `usd` is known (its meter):
     * that is counted as spent, up to what the hour can still hold; the reservation goes. MONEY-R3-1: not
     * only what was held: a round that ran past the hold (a search result far larger than counted ahead,
     * at an hour that couldn't grow it) may have used the room beside it, so that room is never left on offer.
     */
    settleAtMost: (id, usd) =>
      run(() => {
        const e = mine.get(id);
        if (!e) return false;
        const cost = Math.min(isNum(usd) && usd > 0 ? usd : 0, e.nano / NANO + roomUsd());
        if (nano(cost) > 0) budget.add(cost);
        drop(id);
        return true;
      }),
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

// ---------------------------------------------------------------------------------------------
// The backstop: one request's running cost, from its stream

/** Tokens a server tool's result adds to the context, measured from its JSON (3 characters a token). */
function resultTokensOf(block) {
  let chars = 0;
  try {
    chars = JSON.stringify(block).length;
  } catch {
    chars = 0;
  }
  const measured = Math.ceil(chars / CHARS_PER_TOKEN);
  const c = block && block.content;
  const failed = c && typeof c === 'object' && !Array.isArray(c) && (typeof c.error_code === 'string' || /error/.test(String(c.type || '')));
  if (failed) return measured;
  return block.type === 'web_search_tool_result' ? Math.max(GATE_LIMITS.searchTokens, measured) : Math.max(1000, measured);
}

/** The line a gated answer stopped before it fetches a whole page ends with (MONEY-R2-1: not the cap line). */
export const FETCH_LINE = "That needs a whole web page, which I don't open while the live view is on. Say 'stop live view' and ask again.";

/**
 * The running cost of one request sent while the live view is on, on the high side, from its stream
 * events, against what is held for it (`limitUsd`, grown from the hour's room as it goes). Like the home
 * base's brain client (core/server/brain/claude.mjs):
 *   - its prompt as message_start reports it (cache reads, cache writes and the rest, each at its
 *     price), and all of max_tokens at the output price from the start;
 *   - each web search $0.01 when it starts;
 *   - each server-tool round: its result written to the cache (4,000 tokens at least for a search, its
 *     measured size once it arrives), and everything before it read again from the cache (the prompt's
 *     uncached part at the write price), the output written once;
 *   - a round a running tool will start is counted ahead (a search as 8,000 tokens, a page as its
 *     max_content_tokens), so the request stops before that round rather than after it.
 * MONEY-R2-1: when the estimate would pass what is held, the hold grows (`canGrow(usd)`: the hour holds
 * it now; `grow(usd)`: the reservation grows, through the lock; meanwhile the tool runs on the server).
 * The request stops only when the hour itself can't hold the next round (tripped 'cost': the cap line is
 * then true), or when it starts to fetch a page beyond `web.fetches` (tripped 'fetch', before the fetch
 * runs: a fetched PDF has no size limit). onEvent(event) → true once it must stop now; a stop decided
 * later (a grow the lock turned down) calls `onStop()`.
 * spent() / committed() in USD (committed: with the rounds running tools will start; an upper bound of
 * what the request may have cost); started: its prompt was billed (message_start seen); tripped: why it
 * stopped ('cost' | 'fetch') or null.
 */
export function createRequestMeter({ model, maxTokens, limitUsd, web = LIVE_WEB, tools, canGrow = null, grow = null, onStop = null } = {}) {
  const price = priceOf(model);
  const write = price.cacheWrite5mPerM / 1e6;
  const read = price.cacheReadPerM / 1e6;
  const out = isNum(maxTokens) && maxTokens > 0 ? maxTokens : 0;
  let limit = isNum(limitUsd) ? limitUsd : 0;
  const fetchTokens = fetchTokensOf(tools);
  const fetchBudget = web && isNum(web.fetches) ? web.fetches : allowedFetches(tools);
  // What each grow asks for beyond the need: one more search round, so the next one rarely asks again.
  const headroom = GATE_LIMITS.searchUsd + GATE_LIMITS.searchExpectedTokens * write;
  let promptUsd = 0; // the first round's input, as billed
  let rereadUsd = 0; // the prompt read again in a later round
  let searches = 0;
  let fetches = 0;
  let resultTokens = 0;
  let roundsUsd = 0;
  let rounds = 0;
  let started = false;
  const blocks = new Map(); // stream index → { type, name, id }
  const pending = new Map(); // server_tool_use id → the tokens its result is expected to add
  let tripped = null;
  let growing = null; // a grow under way (one at a time)

  // A later round: everything before it read again from the cache, `added` tokens written to it.
  const roundUsd = (added) => rereadUsd + (out + resultTokens) * read + added * write;
  const outputUsd = () => out * (price.outPerM / 1e6) + (rounds || pending.size ? out * write : 0);
  const spent = () => promptUsd + outputUsd() + searches * GATE_LIMITS.searchUsd + roundsUsd;
  const committed = () => {
    let usd = spent();
    for (const tokens of pending.values()) usd += roundUsd(tokens);
    return usd;
  };
  const stopFor = (reason) => {
    if (!tripped) tripped = reason;
  };
  // True when it must stop now. With room in the hour the hold grows instead (asked through the lock;
  // a refusal there stops it then, through onStop): by a round more than it needs where the hour has
  // that, else by just what it needs. It stops only when the hour can't hold even that.
  const check = () => {
    if (tripped) return true;
    const need = committed() - limit;
    if (need <= 1e-9) return false;
    if (growing) return false; // decided when the grow under way answers
    let ask = 0;
    try {
      if (typeof canGrow === 'function' && typeof grow === 'function') {
        if (canGrow(need + headroom) === true) ask = need + headroom;
        else if (canGrow(need) === true) ask = need;
      }
    } catch {
      ask = 0;
    }
    if (!(ask > 0)) {
      stopFor('cost');
      return true;
    }
    const stop = () => {
      stopFor('cost');
      if (typeof onStop === 'function') onStop();
    };
    growing = Promise.resolve()
      .then(() => grow(ask))
      .then(
        (r) => {
          growing = null;
          if (tripped) return;
          if (!(r && r.ok)) return stop();
          limit = isNum(r.usd) ? r.usd : limit + ask;
          if (check() && typeof onStop === 'function') onStop(); // more may have come meanwhile
        },
        () => {
          growing = null;
          if (!tripped) stop();
        },
      );
    return false;
  };

  function onEvent(event) {
    if (tripped) return true;
    if (!event || typeof event !== 'object') return false;
    if (event.type === 'message_start') {
      const u = (event.message && event.message.usage) || {};
      const tok = (v) => (isNum(v) && v > 0 ? v : 0);
      const uncached = tok(u.input_tokens);
      const cached = tok(u.cache_creation_input_tokens) + tok(u.cache_read_input_tokens);
      promptUsd = (uncached * price.inPerM + tok(u.cache_creation_input_tokens) * price.cacheWrite5mPerM + tok(u.cache_read_input_tokens) * price.cacheReadPerM) / 1e6;
      rereadUsd = cached * read + uncached * write;
      started = true;
      return check();
    }
    if (event.type === 'content_block_start') {
      const b = event.content_block || {};
      const type = typeof b.type === 'string' ? b.type : '';
      blocks.set(event.index, { type, name: b.name, id: b.id });
      if (type === 'server_tool_use') {
        if (b.name === 'web_search') searches += 1;
        else if (b.name === 'web_fetch') {
          fetches += 1;
          if (fetches > fetchBudget) {
            stopFor('fetch'); // stopped before it runs
            return true;
          }
        }
        return check();
      }
      if (type.endsWith('_tool_result')) {
        // A server tool answered: the next round reads everything so far again, this result included.
        if (typeof b.tool_use_id === 'string') pending.delete(b.tool_use_id);
        const tokens = resultTokensOf(b);
        roundsUsd += roundUsd(tokens);
        resultTokens += tokens;
        rounds += 1;
        return check();
      }
      return false;
    }
    if (event.type === 'content_block_stop') {
      const b = blocks.get(event.index);
      blocks.delete(event.index);
      if (b && b.type === 'server_tool_use' && typeof b.id === 'string') {
        // The tool runs now, on Anthropic's side: the round its result starts is counted ahead.
        pending.set(b.id, b.name === 'web_fetch' ? fetchTokens : b.name === 'web_search' ? GATE_LIMITS.searchExpectedTokens : 1000);
        return check();
      }
    }
    return false;
  }

  return {
    onEvent,
    spent,
    committed,
    get limitUsd() {
      return limit;
    },
    get started() {
      return started;
    },
    get tripped() {
      return tripped;
    },
  };
}

/**
 * What the engine consults before each lead request of a turn (startTurn({ gate }), lead.js). One per
 * turn, made when the turn starts: whether the live view is on then decides it (`startedOn`,
 * default: isOn() now). A turn asked while the live view was off is never shortened, refused or
 * counted, even if the live view starts before it ends (a mission's summary after its agents).
 *   active             the turn was asked while the live view was on
 *   turnNote           the line for its turn context (gateNote), or '' when not active
 *   maxTokens(first)   null when not active or once the live view is off (the request goes out as
 *                      usual), else 4,000 for the turn's first request and 1,000 for later ones
 *   reserve({ params, model }) → null (nothing to do), { refused: true, message } (don't send: the
 *                      turn ends with `message`), or a ticket { usd, maxTokens, web, settle(cost),
 *                      release(), keep(partialCost), meter({ maxTokens, tools }), message() }. The
 *                      ticket holds the request's worst case with LIVE_WEB, or all that is left of
 *                      the hour when that covers its input and a useful answer (maxTokens then
 *                      fits it: fitRequest); `meter` follows the request against it (lead.js stops
 *                      the request when it trips; `message()` is the line the turn then ends with).
 *                      A turn asked during the live view keeps counting after it stops (v8.0's
 *                      rule: a question asked during the live view counts in full): its later
 *                      requests get a ticket of 0 that counts their real cost.
 * `isOn()`: whether the live view is on in this window now (paused counts as on).
 */
export function createTurnGate({ gate, isOn, startedOn } = {}) {
  const on = () => {
    try {
      return !!isOn();
    } catch {
      return false;
    }
  };
  const active = typeof startedOn === 'boolean' ? startedOn : on();
  // MONEY-R2-2: a turn resumed after it went through the live view (startedOn true) counts from the start.
  let counting = startedOn === true;
  return {
    active,
    turnNote: active ? gateNote : '',
    maxTokens: (first) => (active && on() ? gateMaxTokens(first) : null),
    get counting() {
      return counting;
    },
    async reserve({ params, model } = {}) {
      if (!active) return null;
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
      const worst = requestWorstUsd(params, { model, web: LIVE_WEB });
      const floor = requestFloorUsd(params, { model });
      const lineFor = (r) => capLine(r && isNum(r.resumeAt) ? r.resumeAt : gate.resumeAt(floor));
      const r = typeof gate.reserveUpTo === 'function' ? await gate.reserveUpTo(worst, floor) : await gate.reserve(worst);
      if (!r || !r.ok) return { refused: true, message: capLine(r ? r.resumeAt : Infinity), usd: worst };
      const held = isNum(r.usd) ? r.usd : worst;
      const partial = held + 1e-12 < worst;
      const fit = partial ? fitRequest(params, { model, web: LIVE_WEB, usd: held }) : null;
      if (partial && !fit) {
        // Not even a useful answer fits what was held (rounding at the floor): nothing is sent.
        await gate.release(r.id);
        return { refused: true, message: capLine(gate.resumeAt(floor)), usd: worst };
      }
      const maxTokens = fit ? fit.maxTokens : isNum(params && params.max_tokens) ? params.max_tokens : null;
      const web = fit ? fit.web : LIVE_WEB;
      // One outcome per ticket: answered, failed before billing, or stopped after it was sent.
      let done = false;
      const finish = (fn) => {
        if (done) return undefined;
        done = true;
        return fn();
      };
      return {
        usd: held,
        maxTokens,
        web,
        settle: (cost) => finish(() => gate.settle(r.id, Number(cost) || 0)),
        release: () => finish(() => gate.release(r.id)),
        keep: () => finish(() => gate.keep(r.id)),
        // MONEY-R2-3: stopped or cut after it was sent, with its meter's upper bound of what it may have cost.
        settleAtMost: (usd) => finish(() => (typeof gate.settleAtMost === 'function' ? gate.settleAtMost(r.id, Number(usd) || 0) : gate.keep(r.id))),
        // MONEY-R2-1: the meter grows the hold from the hour's room; it stops the request only when the hour
        // can't hold its next round.
        meter: ({ maxTokens: max, tools, onStop } = {}) =>
          createRequestMeter({
            model,
            maxTokens: isNum(max) ? max : maxTokens,
            limitUsd: held,
            web,
            tools,
            canGrow: typeof gate.extend === 'function' ? (usd) => gate.fits(usd) : null,
            grow: typeof gate.extend === 'function' ? (usd) => gate.extend(r.id, usd) : null,
            onStop,
          }),
        // The line a stopped request ends with (asked once it is settled): the cap line only when the hour
        // is the reason, with when the hour holds the question again.
        message: (reason) => (reason === 'fetch' ? FETCH_LINE : lineFor(null)),
      };
    },
  };
}

/**
 * MONEY-R2-2: the gate for a turn resumed with Resume (app.js resume()): the decision made when the turn
 * was asked (`turn.liveGated`, recorded by startTurn) holds. A turn asked outside the live view (with it
 * off, or the research offer's Mission) resumes ungated, at its normal max_tokens; one asked during it is
 * held again, and counted in full even if the live view has stopped since (v8.0's rule). A turn saved
 * before v8.1.1 has no record: as in v8.1, the live view's state at Resume decides.
 */
export function resumeTurnGate({ gate, isOn, turn } = {}) {
  const recorded = turn && typeof turn.liveGated === 'boolean' ? turn.liveGated : undefined;
  return createTurnGate({ gate, isOn, startedOn: recorded });
}
