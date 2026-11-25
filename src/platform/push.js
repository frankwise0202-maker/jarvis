// Web Push for the home base (v7.6, SPEC §24): this device's push subscription, made with the
// Jarvis Core's VAPID public key, so the Core can notify the iPhone (a Home Screen web app, iOS 16.4+)
// or Chrome when research finishes, a watcher fires or the morning briefing is ready. The service
// worker (public/sw.js) shows what arrives.
//
//   pushSupport()                  -> 'ok' | 'ios-tab' (an iPhone's Safari tab: needs the Home Screen app)
//                                     | 'unsupported' | 'insecure'
//   currentSubscription()          -> Promise<{ endpoint, keys: { p256dh, auth } } | null>
//   subscribePush(vapidKey, { requestPermission }) -> Promise<{ ok: true, subscription } | { ok: false, reason, message }>
//       Call it from a tap: the permission prompt (requestPermission, attention.js) comes first, in
//       the gesture. A subscription made with another key (a reinstalled Core) is replaced.
//   unsubscribePush()              -> Promise<string> (the endpoint it had, '' if none)
//   vapidKeyBytes(base64url)       -> Uint8Array (the applicationServerKey)

import { isIOS, isStandalone } from './env.js';

const READY_TIMEOUT_MS = 8000;

function nav() {
  return typeof navigator !== 'undefined' ? navigator : null;
}

export function pushSupport() {
  try {
    if (typeof window === 'undefined') return 'unsupported';
    if (window.isSecureContext === false) return 'insecure';
    const n = nav();
    const ok = !!(n && n.serviceWorker && 'PushManager' in window && 'Notification' in window);
    if (ok) return 'ok';
    // Safari on an iPhone has Web Push only in the app added to the Home Screen.
    if (isIOS() && !isStandalone()) return 'ios-tab';
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/** base64url (the Core's VAPID public key) -> bytes. */
export function vapidKeyBytes(key) {
  const s = String(key || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub, bytes) {
  try {
    const k = sub && sub.options && sub.options.applicationServerKey;
    if (!k) return true; // can't tell: keep it
    const a = new Uint8Array(k);
    if (a.length !== bytes.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== bytes[i]) return false;
    return true;
  } catch {
    return true;
  }
}

async function registration() {
  const n = nav();
  if (!n || !n.serviceWorker) return null;
  let timer = 0;
  try {
    if (typeof n.serviceWorker.getRegistration === 'function' && !(await n.serviceWorker.getRegistration())) return null;
    return await Promise.race([n.serviceWorker.ready, new Promise((resolve) => (timer = setTimeout(() => resolve(null), READY_TIMEOUT_MS)))]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function asJson(sub) {
  if (!sub) return null;
  try {
    const j = typeof sub.toJSON === 'function' ? sub.toJSON() : sub;
    if (!j || typeof j.endpoint !== 'string' || !j.keys || typeof j.keys.p256dh !== 'string' || typeof j.keys.auth !== 'string') return null;
    return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } };
  } catch {
    return null;
  }
}

export async function currentSubscription() {
  if (pushSupport() !== 'ok') return null;
  const reg = await registration();
  if (!reg || !reg.pushManager) return null;
  try {
    return asJson(await reg.pushManager.getSubscription());
  } catch {
    return null;
  }
}

/**
 * Turn notifications on for this device: the permission (from the tap), then a push subscription
 * with the home base's key.
 */
export async function subscribePush(vapidKey, { requestPermission } = {}) {
  const support = pushSupport();
  if (support === 'ios-tab') return { ok: false, reason: 'ios-tab', message: 'On iPhone, add Jarvis to your Home Screen first (Share → Add to Home Screen), then turn notifications on in the app.' };
  if (support !== 'ok') return { ok: false, reason: 'unsupported', message: 'This browser can’t get notifications from the home base.' };
  if (!vapidKey) return { ok: false, reason: 'nokey', message: 'The home base didn’t send its notification key. Update Jarvis Core, then try again.' };
  // The prompt first, while the tap still counts.
  let permission = 'default';
  try {
    permission = typeof requestPermission === 'function' ? await requestPermission() : await Notification.requestPermission();
  } catch {
    permission = 'default';
  }
  if (permission === 'denied') {
    return {
      ok: false,
      reason: 'denied',
      message: isIOS() ? 'Notifications are off for Jarvis. Turn them on in iPhone Settings → Notifications → Jarvis, then try again.' : 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.',
    };
  }
  if (permission !== 'granted') return { ok: false, reason: 'default', message: 'Notifications weren’t allowed. Tap again and choose Allow.' };
  const reg = await registration();
  if (!reg || !reg.pushManager) return { ok: false, reason: 'unsupported', message: 'Jarvis’s offline helper isn’t running yet. Reload Jarvis, then try again.' };
  let bytes;
  try {
    bytes = vapidKeyBytes(vapidKey);
  } catch {
    return { ok: false, reason: 'nokey', message: 'The home base sent a notification key Jarvis couldn’t read.' };
  }
  try {
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, bytes)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    const json = asJson(sub);
    return json ? { ok: true, subscription: json } : { ok: false, reason: 'failed', message: 'The browser made a subscription Jarvis couldn’t read.' };
  } catch (err) {
    const name = err && err.name ? String(err.name) : '';
    return { ok: false, reason: 'failed', message: name === 'NotAllowedError' ? 'Notifications weren’t allowed.' : 'The browser couldn’t sign up for notifications just now. Try again in a moment.' };
  }
}

export async function unsubscribePush() {
  if (pushSupport() !== 'ok') return '';
  const reg = await registration();
  if (!reg || !reg.pushManager) return '';
  try {
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return '';
    const endpoint = sub.endpoint || '';
    await sub.unsubscribe().catch(() => false);
    return endpoint;
  } catch {
    return '';
  }
}
