// Who may connect, and from which web pages.
//
// The Core listens on 127.0.0.1 only. A request is allowed when it is either
//   - direct from this computer: no proxy headers, and a Host of localhost / 127.0.0.1 / [::1]
//     (the Host check stops DNS-rebinding pages from reading the API), or
//   - proxied by `tailscale serve` for a tailnet user: it carries Tailscale-User-Login (Tailscale sets it
//     and strips any copy sent by the client), and its Host is this machine's tailnet name (*.ts.net).
// Anything else is refused with 403.
//
// Browser origins (CORS): https://frankwise0202-maker.github.io (the Jarvis app), any localhost origin,
// and the page's own origin (the dashboard opened through the Tailscale URL). Requests from any other
// origin are refused, as are cross-site no-cors requests to the API (Sec-Fetch-Site).

const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const isLoopbackAddress = (a) => typeof a === 'string' && (a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1' || a.startsWith('127.'));

/** "host:port" or "[v6]:port" → lower-case hostname. */
export function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? '').trim().toLowerCase();
  if (!h) return '';
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  const i = h.lastIndexOf(':');
  return i > 0 && h.indexOf(':') === i ? h.slice(0, i) : h;
}

export const isLocalHostname = (h) => LOCAL_NAMES.has(h);

const one = (v) => (Array.isArray(v) ? v[0] : v);

/**
 * Classify a request: { ok, via: 'local' | 'tailscale', login, name, key, scheme, host } or
 * { ok: false, reason }. `tailscaleDnsName` is this machine's tailnet name when known.
 */
export function checkAccess(req, { tailscaleDnsName = null, tailscaleLogins = [] } = {}) {
  const remote = req.socket?.remoteAddress;
  if (!isLoopbackAddress(remote)) return { ok: false, reason: 'requests must come from this computer or through Tailscale' };
  const h = req.headers ?? {};
  const host = String(one(h.host) ?? '').trim().toLowerCase();
  const hostname = hostnameOf(host);
  const login = String(one(h['tailscale-user-login']) ?? '').trim();
  const proxied = Boolean(h['x-forwarded-for'] || h['x-forwarded-host'] || h['x-forwarded-proto'] || h.forwarded || h.via);

  if (login) {
    const tailnetHost = tailscaleDnsName ? hostname === tailscaleDnsName.toLowerCase() : hostname.endsWith('.ts.net');
    if (!tailnetHost && !isLocalHostname(hostname)) return { ok: false, reason: `unexpected host "${hostname}"` };
    if (tailscaleLogins.length && !tailscaleLogins.map((l) => l.toLowerCase()).includes(login.toLowerCase())) {
      return { ok: false, reason: 'this Tailscale user is not allowed' };
    }
    const proto = String(one(h['x-forwarded-proto']) ?? '').toLowerCase();
    return {
      ok: true,
      via: 'tailscale',
      login,
      name: String(one(h['tailscale-user-name']) ?? '').trim() || null,
      key: `tailscale:${login.toLowerCase()}`,
      scheme: proto === 'http' ? 'http' : 'https',
      host,
    };
  }
  if (proxied) return { ok: false, reason: 'requests from other devices must come through Tailscale serve' };
  if (!isLocalHostname(hostname)) return { ok: false, reason: `unexpected host "${hostname || '(none)'}"` };
  return { ok: true, via: 'local', login: null, name: null, key: 'local', scheme: 'http', host };
}

/**
 * Browser origin check: { ok, allow } where allow is the origin to echo in Access-Control-Allow-Origin
 * (null when the request has no Origin header).
 */
export function checkOrigin(req, access, { allowedOrigins = [] } = {}) {
  const h = req.headers ?? {};
  const origin = one(h.origin);
  const site = String(one(h['sec-fetch-site']) ?? '').toLowerCase();
  const mode = String(one(h['sec-fetch-mode']) ?? '').toLowerCase();
  if (!origin) {
    // A cross-site page may still try an <img>/<script> no-cors request at the API; refuse those.
    if (site === 'cross-site' && mode && mode !== 'navigate') return { ok: false, allow: null, reason: 'cross-site request without an allowed origin' };
    return { ok: true, allow: null };
  }
  if (origin === 'null') return { ok: false, allow: null, reason: 'opaque origin' };
  let u;
  try {
    u = new URL(origin);
  } catch {
    return { ok: false, allow: null, reason: 'malformed origin' };
  }
  if (allowedOrigins.includes(origin)) return { ok: true, allow: origin };
  if ((u.protocol === 'http:' || u.protocol === 'https:') && isLocalHostname(u.hostname)) return { ok: true, allow: origin };
  if (access?.host && origin === `${access.scheme}://${access.host}`) return { ok: true, allow: origin };
  return { ok: false, allow: null, reason: `origin ${origin} is not allowed` };
}

/** CORS response headers for an allowed origin. */
export function corsHeaders(allow, req, { preflight = false } = {}) {
  if (!allow) return {};
  const out = { 'Access-Control-Allow-Origin': allow, Vary: 'Origin' };
  if (preflight) {
    out['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    out['Access-Control-Allow-Headers'] = 'Content-Type, Last-Event-ID';
    out['Access-Control-Max-Age'] = '600';
    out.Vary = 'Origin, Access-Control-Request-Headers, Access-Control-Request-Private-Network';
    if (String(req.headers?.['access-control-request-private-network'] ?? '').toLowerCase() === 'true') {
      out['Access-Control-Allow-Private-Network'] = 'true';
    }
  }
  return out;
}
