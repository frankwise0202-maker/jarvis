// Small, dependency-free helpers shared by the engine. No DOM access here.

/** Random id: crypto.randomUUID() when available, else a random base36 string. */
export function uid() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    /* insecure context: fall through */
  }
  let s = '';
  while (s.length < 24) s += Math.random().toString(36).slice(2);
  return s.slice(0, 24);
}

/**
 * Deep copy through JSON. Drops non-enumerable properties and anything that is not plain data,
 * which is exactly what we want for SDK objects we store or send back to the API.
 */
export function jsonCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Collapse all whitespace (including newlines) to single spaces and trim. */
export function singleLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Truncate to at most `max` characters, ending with "…" when shortened. Never splits a surrogate pair. */
export function truncate(s, max) {
  const str = String(s ?? '');
  if (str.length <= max) return str;
  let cut = str.slice(0, Math.max(0, max - 1));
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trimEnd() + '…';
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return String(url || '');
  }
}

export function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function abortError(message = 'Aborted') {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

/** Promise that resolves after `ms`, or rejects with an AbortError as soon as `signal` aborts. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    let timer = null;
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** IANA time zone of this device, e.g. "America/New_York" ('' if unavailable). */
export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/**
 * "Thursday, 19 November 2026, 16:35 (America/New_York)". Built from Intl parts so the shape is
 * the same on every engine; falls back to Date#toString if Intl rejects the zone.
 */
export function formatLocalTime(date, timeZone = localTimeZone()) {
  const d = date instanceof Date ? date : new Date(date);
  try {
    const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    if (timeZone) opts.timeZone = timeZone;
    const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const text = `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')}`;
    return timeZone ? `${text} (${timeZone})` : text;
  } catch {
    return d.toString();
  }
}

// ---------------------------------------------------------------------------------------------
// Tolerant partial-JSON parser, used only to preview tool input while it streams (live mission
// planning). Unlike the SDK's parser it keeps partially streamed string values, so a task
// description appears as it is written. Returns undefined on input that can never become JSON.

const MISSING = Symbol('missing');

export function parsePartialJson(text) {
  if (typeof text !== 'string') return undefined;
  const n = text.length;
  let i = 0;
  let eof = false;

  const skipWs = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
    if (i >= n) eof = true;
  };

  const fail = () => {
    throw new SyntaxError('bad json');
  };

  function parseString(allowPartial) {
    i++; // opening quote
    let out = '';
    while (i < n) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === '\\') {
        if (i + 1 >= n) break;
        const esc = text[i + 1];
        if (esc === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (hex.length < 4) break; // incomplete escape at the end
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (!(esc in map)) fail();
        out += map[esc];
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    eof = true;
    return allowPartial ? out : MISSING;
  }

  function parseLiteral() {
    const rest = text.slice(i);
    for (const [word, value] of [['true', true], ['false', false], ['null', null]]) {
      if (rest.startsWith(word)) {
        i += word.length;
        return value;
      }
      if (word.startsWith(rest)) {
        i = n;
        eof = true;
        return MISSING;
      }
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (!m) {
      // A number cut off at the end of the buffer ("-", "1.", "1e-") is pending, not invalid.
      if (/^-?(?:\d+(?:\.\d*)?(?:[eE][+-]?\d*)?)?$/.test(rest)) {
        i = n;
        eof = true;
        return MISSING;
      }
      fail();
    }
    i += m[0].length;
    if (i >= n) eof = true;
    return Number(m[0]);
  }

  function parseValue() {
    skipWs();
    if (eof) return MISSING;
    const ch = text[i];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString(true);
    return parseLiteral();
  }

  function parseObject() {
    i++;
    const out = {};
    for (;;) {
      skipWs();
      if (eof) return out;
      const ch = text[i];
      if (ch === '}') {
        i++;
        return out;
      }
      if (ch === ',') {
        i++;
        continue;
      }
      if (ch !== '"') fail();
      const key = parseString(false);
      if (key === MISSING) return out;
      skipWs();
      if (eof) return out;
      if (text[i] !== ':') fail();
      i++;
      const v = parseValue();
      if (v !== MISSING) out[key] = v;
      if (eof) return out;
    }
  }

  function parseArray() {
    i++;
    const out = [];
    for (;;) {
      skipWs();
      if (eof) return out;
      const ch = text[i];
      if (ch === ']') {
        i++;
        return out;
      }
      if (ch === ',') {
        i++;
        continue;
      }
      const v = parseValue();
      if (v !== MISSING) out.push(v);
      if (eof) return out;
    }
  }

  try {
    const v = parseValue();
    return v === MISSING ? undefined : v;
  } catch {
    return undefined;
  }
}
