// Push notifications to the owner's iPhone (the Home Screen web app, iOS 16.4+) and to Chrome: Web Push with
// VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291), through the `web-push` library, imported only
// when a notification is sent, so the Core starts and serves everything else without core/node_modules.
//
//   push.info()                        -> { vapidPublicKey, devices: [{ id, label, addedAt }] }
//   await push.subscribe({ subscription: { endpoint, keys: { p256dh, auth } }, label })   -> { id }
//   await push.unsubscribe({ endpoint })                    -> { removed }
//   await push.notify({ title, body, url, tag })            -> { sent, failed, dropped }   never throws
//   await push.test({ endpoint }?)                          -> { sent, failed }
//   await push.available()                                  -> web-push can be loaded
//
// On disk (folder 700, files 600): <dir>/vapid.json (the VAPID key pair, made with node:crypto on the first
// run) and <dir>/subscriptions.json. With dir null everything stays in memory (fixture mode). Push endpoints
// are capability URLs: they are never returned by the API and only their host is ever logged. Messages live
// 24 hours at the push service (TTL); a subscription the service calls gone (404/410) is dropped.

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

export const APP_URL = 'https://frankwise0202-maker.github.io/jarvis/';
export const VAPID_SUBJECT = APP_URL; // an https: subject (Apple refuses localhost; no e-mail address in the repo)
export const TTL_SEC = 24 * 3600;
export const MAX_DEVICES = 20;
const TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_BYTES = 3000; // well inside the 4 KB that every push service accepts
const LIMITS = { title: 120, body: 600, tag: 64, label: 40, endpoint: 2048, url: 512 };

export class PushError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.expose = true;
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** A fresh VAPID key pair: the uncompressed P-256 public point (65 bytes) and the private scalar (32 bytes). */
export function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  let priv = ecdh.getPrivateKey();
  if (priv.length < 32) priv = Buffer.concat([Buffer.alloc(32 - priv.length), priv]);
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(priv) };
}

function vapidKeysValid(k) {
  try {
    if (!k || typeof k.publicKey !== 'string' || typeof k.privateKey !== 'string') return false;
    const pub = Buffer.from(k.publicKey, 'base64url');
    const priv = Buffer.from(k.privateKey, 'base64url');
    if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return false;
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(priv);
    return ecdh.getPublicKey().equals(pub);
  } catch {
    return false;
  }
}

/** A push endpoint the Core may post to: https on a public host name (never a local or private address). */
function endpointProblem(endpoint, allowInsecure) {
  if (typeof endpoint !== 'string' || !endpoint) return 'the subscription has no endpoint';
  if (endpoint.length > LIMITS.endpoint) return 'the endpoint is too long';
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return 'the endpoint is not a web address';
  }
  if (u.username || u.password) return 'the endpoint must not carry a user name';
  if (allowInsecure && (u.protocol === 'http:' || u.protocol === 'https:')) return null; // tests: a local fake push service
  if (u.protocol !== 'https:') return 'the endpoint must be https';
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (net.isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.')) return "the endpoint must be a push service's name, not an address";
  if (host === 'localhost' || /\.(localhost|local|lan|home|internal|intranet|corp|ts\.net|home\.arpa)$/.test(host)) return 'the endpoint must be a public push service';
  return null;
}

function cleanKey(v, { len, min }) {
  if (typeof v !== 'string' || v.length > 200 || !/^[A-Za-z0-9_\-+/]+=*$/.test(v)) return null;
  const buf = Buffer.from(v, 'base64url');
  if (len && buf.length !== len) return null;
  if (min && buf.length < min) return null;
  return b64url(buf);
}

function cleanText(v, max, { lines = false } = {}) {
  if (typeof v !== 'string') return '';
  let s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, (c) => (c === '\t' ? ' ' : ''));
  s = lines ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  const chars = [...s];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : s;
}

/** The notification as the app's service worker reads it: { title, body, url, tag }, small enough for any push service. */
export function buildPayload({ title, body, url, tag } = {}) {
  const msg = {
    title: cleanText(title, LIMITS.title) || 'Jarvis',
    body: cleanText(body, LIMITS.body, { lines: true }),
    url: typeof url === 'string' && url.startsWith(APP_URL) && url.length <= LIMITS.url && !/[\s<>"]/.test(url) ? url : APP_URL,
    tag: cleanText(tag, LIMITS.tag) || 'jarvis',
  };
  let text = JSON.stringify(msg);
  while (Buffer.byteLength(text) > MAX_PAYLOAD_BYTES && msg.body.length > 0) {
    msg.body = cleanText(msg.body, Math.floor([...msg.body].length * 0.8), { lines: true });
    if ([...msg.body].length <= 1) msg.body = '';
    text = JSON.stringify(msg);
  }
  return text;
}

function hostOf(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'an unknown push service';
  }
}

/** POST the encrypted message; resolves { status } or { error } (never rejects). */
function post(details, { timeoutMs, allowInsecure }) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(details.endpoint);
    } catch {
      resolve({ error: 'bad_endpoint' });
      return;
    }
    const mod = u.protocol === 'https:' ? https : allowInsecure && u.protocol === 'http:' ? http : null;
    if (!mod) {
      resolve({ error: 'bad_endpoint' });
      return;
    }
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      resolve(r);
    };
    const headers = { ...details.headers };
    let req;
    try {
      req = mod.request(u, { method: 'POST', headers, timeout: timeoutMs }, (res) => {
        res.resume();
        res.on('end', () => finish({ status: res.statusCode }));
        res.on('error', () => finish({ status: res.statusCode }));
      });
    } catch (err) {
      finish({ error: err?.code ?? 'request_failed' });
      return;
    }
    const hard = setTimeout(() => req.destroy(new Error('timed out')), timeoutMs + 2000);
    hard.unref?.();
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', (err) => finish({ error: err?.code ?? err?.message ?? 'request_failed' }));
    req.end(details.body ?? undefined);
  });
}

/**
 * createPush({ dir, log, importWebPush, allowInsecure, timeoutMs, now }) -> push. Synchronous: the VAPID keys
 * are loaded (or made) and the subscriptions read right away; a broken file is moved aside, never fatal.
 *   importWebPush  () => Promise<module>  (tests; default: import('web-push'))
 *   allowInsecure  accept http:// and local endpoints (tests with a local fake push service only)
 */
export function createPush({ dir = null, log = () => {}, importWebPush = null, allowInsecure = false, timeoutMs = TIMEOUT_MS, now = () => Date.now() } = {}) {
  const files = dir ? { vapid: path.join(dir, 'vapid.json'), subs: path.join(dir, 'subscriptions.json') } : null;
  let vapid = null;
  let devices = []; // { id, endpoint, keys: { p256dh, auth }, label, addedAt, lastOkAt, lastError, failures }

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // not ours to change
    }
  }

  function writeAtomic(file, obj) {
    ensureDir();
    const tmp = `${file}.tmp-${process.pid}`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(obj));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  }

  function readJson(file) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      return { missing: err?.code === 'ENOENT' };
    }
    try {
      return { value: JSON.parse(raw) };
    } catch (err) {
      const aside = `${file}.corrupt-${now()}`;
      try {
        fs.renameSync(file, aside);
      } catch {
        // nothing to move
      }
      log(`push: could not read ${path.basename(file)} (${err?.message ?? err}); moved it to ${path.basename(aside)}`);
      return { corrupt: true };
    }
  }

  function save() {
    if (!files) return;
    try {
      writeAtomic(files.subs, { v: 1, vapidPublicKey: vapid.publicKey, devices });
    } catch (err) {
      log(`push: could not save the notification devices: ${err?.message ?? err}`);
    }
  }

  // ---- load or make the VAPID keys, then the subscriptions made with them
  if (files) {
    try {
      ensureDir();
      const r = readJson(files.vapid);
      if (r.value && vapidKeysValid(r.value)) {
        vapid = { publicKey: r.value.publicKey, privateKey: r.value.privateKey, createdAt: r.value.createdAt ?? null };
        try {
          fs.chmodSync(files.vapid, 0o600);
        } catch {
          // not ours to change
        }
      } else if (r.value) {
        const aside = `${files.vapid}.corrupt-${now()}`;
        fs.renameSync(files.vapid, aside);
        log(`push: the VAPID keys in vapid.json were not usable; moved the file to ${path.basename(aside)}`);
      }
    } catch (err) {
      log(`push: could not read the VAPID keys: ${err?.message ?? err}`);
    }
  }
  if (!vapid) {
    vapid = { ...generateVapidKeys(), createdAt: new Date(now()).toISOString() };
    if (files) {
      try {
        writeAtomic(files.vapid, vapid);
        log('push: made new VAPID keys for notifications');
      } catch (err) {
        log(`push: could not save the new VAPID keys (${err?.message ?? err}); notifications work until the next restart`);
      }
    }
  }
  if (files) {
    const r = readJson(files.subs);
    if (r.value) {
      const list = Array.isArray(r.value.devices) ? r.value.devices : [];
      if (r.value.vapidPublicKey !== vapid.publicKey) {
        if (list.length) log(`push: ${list.length} notification device(s) were signed up with other VAPID keys; they must turn notifications on again`);
        save();
      } else {
        devices = list.filter((d) => d && typeof d.id === 'string' && !endpointProblem(d.endpoint, allowInsecure) && cleanKey(d.keys?.p256dh, { len: 65 }) && cleanKey(d.keys?.auth, { min: 16 }));
      }
    }
  }

  // ---- web-push, loaded on first use
  let webPush = null; // Promise<module|null>
  let missingLogged = false;
  function loadWebPush() {
    if (!webPush) {
      webPush = (importWebPush ?? (() => import('web-push')))()
        .then((m) => {
          const wp = m?.default ?? m;
          if (typeof wp?.generateRequestDetails !== 'function') throw new Error('web-push has no generateRequestDetails');
          return wp;
        })
        .catch((err) => {
          if (!missingLogged) log(`push: the web-push library isn't installed (${err?.code ?? err?.message ?? err}), so notifications can't be sent until it is (jarvis-core update)`);
          missingLogged = true;
          setTimeout(() => {
            webPush = null; // try again later (an update may have installed it)
          }, 5 * 60_000).unref?.();
          return null;
        });
    }
    return webPush;
  }

  async function sendTo(list, payloadText) {
    const result = { sent: 0, failed: 0, dropped: 0 };
    if (!list.length) return result;
    const wp = await loadWebPush();
    if (!wp) return { ...result, failed: list.length, error: 'web_push_missing' };
    const gone = new Set();
    let changed = false;
    await Promise.all(list.map(async (dev) => {
      let details;
      try {
        details = wp.generateRequestDetails({ endpoint: dev.endpoint, keys: dev.keys }, payloadText, {
          vapidDetails: { subject: VAPID_SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          TTL: TTL_SEC,
          contentEncoding: 'aes128gcm',
          urgency: 'high',
        });
      } catch (err) {
        result.failed += 1;
        log(`push: could not prepare a notification for ${dev.label} (${err?.message ?? err})`);
        return;
      }
      const r = await post(details, { timeoutMs, allowInsecure });
      if (r.status >= 200 && r.status < 300) {
        result.sent += 1;
        dev.lastOkAt = new Date(now()).toISOString();
        dev.failures = 0;
        dev.lastError = null;
        changed = true;
        return;
      }
      result.failed += 1;
      if (r.status === 404 || r.status === 410) {
        gone.add(dev.endpoint);
        log(`push: ${dev.label}'s notification subscription has expired (${r.status} from ${hostOf(dev.endpoint)}); removed it`);
        return;
      }
      dev.failures = (dev.failures ?? 0) + 1;
      dev.lastError = r.status ? `HTTP ${r.status}` : r.error;
      changed = true;
      log(`push: a notification to ${dev.label} failed (${dev.lastError} from ${hostOf(dev.endpoint)})`);
    }));
    if (gone.size) {
      devices = devices.filter((d) => !gone.has(d.endpoint));
      result.dropped = gone.size;
    }
    if (gone.size || changed) save();
    return result;
  }

  return {
    info() {
      return { vapidPublicKey: vapid.publicKey, devices: devices.map(({ id, label, addedAt }) => ({ id, label, addedAt })) };
    },

    async subscribe(body) {
      const sub = body?.subscription;
      if (!sub || typeof sub !== 'object') throw new PushError(400, 'bad_subscription', 'send {"subscription": {"endpoint", "keys": {"p256dh", "auth"}}, "label"}');
      const problem = endpointProblem(sub.endpoint, allowInsecure);
      if (problem) throw new PushError(400, 'bad_subscription', problem);
      const p256dh = cleanKey(sub.keys?.p256dh, { len: 65 });
      const auth = cleanKey(sub.keys?.auth, { min: 16 });
      if (!p256dh || !auth) throw new PushError(400, 'bad_subscription', 'the subscription keys are missing or the wrong size');
      try {
        const probe = crypto.createECDH('prime256v1');
        probe.generateKeys();
        probe.computeSecret(Buffer.from(p256dh, 'base64url')); // a real point on the curve
      } catch {
        throw new PushError(400, 'bad_subscription', 'the subscription key is not a valid P-256 key');
      }
      const label = cleanText(body?.label, LIMITS.label) || 'Device';
      const known = devices.find((d) => d.endpoint === sub.endpoint);
      if (known) {
        Object.assign(known, { keys: { p256dh, auth }, label, failures: 0, lastError: null });
        save();
        return { id: known.id };
      }
      const dev = { id: `p_${crypto.randomBytes(6).toString('hex')}`, endpoint: sub.endpoint, keys: { p256dh, auth }, label, addedAt: new Date(now()).toISOString(), lastOkAt: null, lastError: null, failures: 0 };
      devices.push(dev);
      if (devices.length > MAX_DEVICES) {
        devices.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
        const dropped = devices.splice(0, devices.length - MAX_DEVICES);
        log(`push: more than ${MAX_DEVICES} notification devices; removed the oldest (${dropped.map((d) => d.label).join(', ')})`);
      }
      save();
      log(`push: notifications are on for ${label} (${hostOf(sub.endpoint)})`);
      return { id: dev.id };
    },

    async unsubscribe(body) {
      const endpoint = body?.endpoint;
      if (typeof endpoint !== 'string' || !endpoint) throw new PushError(400, 'bad_endpoint', 'send {"endpoint": "…"} of the subscription to remove');
      const before = devices.length;
      devices = devices.filter((d) => d.endpoint !== endpoint);
      const removed = devices.length !== before;
      if (removed) save();
      return { removed };
    },

    async notify(payload) {
      try {
        return await sendTo([...devices], buildPayload(payload));
      } catch (err) {
        log(`push: sending notifications failed: ${err?.stack ?? err}`);
        return { sent: 0, failed: devices.length, dropped: 0 };
      }
    },

    async test(body) {
      let list = [...devices];
      if (typeof body?.endpoint === 'string' && body.endpoint) {
        list = devices.filter((d) => d.endpoint === body.endpoint);
        if (!list.length) throw new PushError(404, 'unknown_device', "this device isn't signed up for notifications; turn them on first");
      }
      const r = await sendTo(list, buildPayload({ title: 'Jarvis', body: 'Notifications from your home base are working.', url: APP_URL, tag: 'jarvis-test' }));
      return { sent: r.sent, failed: r.failed };
    },

    async available() {
      return !!(await loadWebPush());
    },
  };
}
