// Who may connect, and from which web pages.
//
// The Core listens on 127.0.0.1 only. A request is allowed when it is either
//   - direct from this computer: no proxy headers, and a Host of localhost / 127.0.0.1 / [::1] on the
//     Core's own port (the Host check stops DNS-rebinding pages from reading the API: their Host is the
//     attacker's name), or
//   - proxied by `tailscale serve` for a tailnet user: it carries Tailscale-User-Login (Tailscale sets it
//     and strips any copy sent by the client), and its Host is this machine's tailnet name (*.ts.net).
// Requests that Tailscale marks as public Funnel traffic (Tailscale-Funnel-Request) are always refused,
// even though they arrive from localhost: the Core is private to the tailnet.
// Anything else is refused with 403.
//
// Browser origins (CORS): https://frankwise0202-maker.github.io (the Jarvis app), any localhost origin,
// and the page's own origin (the dashboard opened through the Tailscale URL). Requests from any other
// origin are refused, as are cross-site no-cors requests to the API (Sec-Fetch-Site). Preflights that ask
// for private-network access (Chrome, when a public page calls a 100.x Tailscale address) get
// Access-Control-Allow-Private-Network: true, for allowed origins only.

const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const isLoopbackAddress = (a) => typeof a === 'string' && (a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1' || a.startsWith('127.'));

/**
 * A Host header → { hostname, port }: lower-case, one trailing dot dropped ("alienware.tail1234.ts.net."),
 * IPv6 kept in brackets ("[::1]"), port '' when absent. Anything malformed gives hostname ''.
 */
export function parseHost(hostHeader) {
  const h = String(hostHeader ?? '').trim().toLowerCase();
  if (!h || /[\s/\\@?#]/.test(h)) return { hostname: '', port: '' };
  let hostname;
  let port = '';
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end < 0) return { hostname: '', port: '' };
    hostname = h.slice(0, end + 1);
    const rest = h.slice(end + 1);
    if (rest) {
      if (!/^:\d{1,5}$/.test(rest)) return { hostname: '', port: '' };
      port = rest.slice(1);
    }
  } else {
    const i = h.lastIndexOf(':');
    if (i >= 0 && h.indexOf(':') !== i) return { hostname: '', port: '' }; // a bare IPv6 address is not a Host
    if (i >= 0) {
      port = h.slice(i + 1);
      if (!/^\d{1,5}$/.test(port)) return { hostname: '', port: '' };
      hostname = h.slice(0, i);
    } else hostname = h;
    if (hostname.endsWith('.')) hostname = hostname.slice(0, -1);
  }
  if (port) port = String(Number(port)); // "08788" → "8788"
  return { hostname, port };
}

/** "host:port" or "[v6]:port" → lower-case hostname. */
export const hostnameOf = (hostHeader) => parseHost(hostHeader).hostname;

export const isLocalHostname = (h) => LOCAL_NAMES.has(h);

/** A MagicDNS name: "<machine>.<tailnet>.ts.net" (letters, digits and hyphens per label). */
export const isTailnetHostname = (h) => typeof h === 'string' && h.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(h);

const one = (v) => (Array.isArray(v) ? v[0] : v);

/**
 * Classify a request: { ok, via: 'local' | 'tailscale', login, name, key, scheme, host } or
 * { ok: false, reason }. `tailscaleDnsName` is this machine's tailnet name when known; `port` is the port
 * the Core listens on (a direct request's Host must name it; omitted = not checked).
 */
export function checkAccess(req, { tailscaleDnsName = null, tailscaleLogins = [], port = null } = {}) {
  const remote = req.socket?.remoteAddress;
  if (!isLoopbackAddress(remote)) return { ok: false, reason: 'requests must come from this computer or through Tailscale' };
  const h = req.headers ?? {};
  // Tailscale Funnel (public internet) traffic: Tailscale marks it and strips any copy a client sends.
  if (h['tailscale-funnel-request'] !== undefined) {
    return { ok: false, reason: 'Jarvis Core is private to your tailnet: requests from the public internet (Tailscale Funnel) are refused' };
  }
  const host = String(one(h.host) ?? '').trim().toLowerCase();
  const { hostname, port: hostPort } = parseHost(host);
  const corePort = port === null || port === undefined || port === '' ? null : String(port);
  const localHost = isLocalHostname(hostname) && (corePort === null || hostPort === corePort);
  const ourName = tailscaleDnsName ? String(tailscaleDnsName).toLowerCase().replace(/\.$/, '') : null;
  const tailnetHost = isTailnetHostname(hostname) && (!ourName || hostname === ourName);
  const login = String(one(h['tailscale-user-login']) ?? '').trim();
  const proxied = Boolean(h['x-forwarded-for'] || h['x-forwarded-host'] || h['x-forwarded-proto'] || h.forwarded || h.via);
  const unexpected = () => {
    if (isLocalHostname(hostname) && corePort !== null) return `unexpected host "${host}": this Core listens on port ${corePort}`;
    if (isTailnetHostname(hostname) && ourName) return `unexpected host "${hostname}": this machine's tailnet name is ${ourName}`;
    return `unexpected host "${host || '(none)'}"`;
  };

  if (login) {
    if (!tailnetHost && !localHost) return { ok: false, reason: unexpected() };
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
  if (!localHost) return { ok: false, reason: unexpected() };
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
