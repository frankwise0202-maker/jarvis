// Sync through the home base (v7.6, SPEC §24.7): the pure rules. Each device uploads its backup (the
// app's own export, never the API key) to the Jarvis Core (PUT api/sync/<deviceId>); the others pull
// it (GET api/sync/<deviceId>) and merge it in. src/platform/sync.js talks to the Core,
// src/platform/backup.js (buildSyncBackup, mergeSyncedBackup) reads and writes this device's data,
// src/ui/sync.js runs it.
//
// The merge (conversations, saved holograms and blueprints, remembered facts) only ever adds:
//   · missing here and never seen on this device: added;
//   · missing here but this device had it before (the owner deleted it here): left out, so a
//     deletion is never undone by another device's copy (and never spreads to it either);
//   · on both: the newer updatedAt wins, except that a conversation never loses turns: when the two
//     copies went different ways (each has turns the other lacks), this device keeps its own and
//     the other device's version is kept next to it as "<title> (from <device>)", one copy per
//     device (MIRROR_MARK), updated as that device goes on. Those copies are never passed on.
// Every step is idempotent (the same backup merged twice changes nothing), so a sync cut off half
// way (the app closed) just carries on next time.

import { cleanLine } from './homebase.js';

/** The Core keeps backups up to this size (the JSON, before and after gzip). */
export const SYNC_MAX_BYTES = 50 * 1024 * 1024;
export const DEVICE_ID_RE = /^[a-z0-9-]{8,64}$/;
/** A conversation id with this in it is another device's version of a conversation (see the header). */
export const MIRROR_MARK = '~sync-';
/** While the app is open: a sync every 10 minutes, and 2 minutes after the last change. */
export const SYNC_INTERVAL_MS = 10 * 60 * 1000;
export const SYNC_DEBOUNCE_MS = 2 * 60 * 1000;
export const LABEL_MAX = 60;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A new device id: 'jd-' and 24 hex characters, from 12 random bytes. */
export function newDeviceId(bytes) {
  const b = bytes && typeof bytes.length === 'number' && bytes.length >= 12 ? bytes : null;
  if (!b) throw new TypeError('newDeviceId: 12 random bytes are required');
  let hex = '';
  for (let i = 0; i < 12; i++) hex += (b[i] & 0xff).toString(16).padStart(2, '0');
  return `jd-${hex}`;
}

export function validDeviceId(id) {
  return typeof id === 'string' && DEVICE_ID_RE.test(id);
}

/** Is this conversation id another device's version of a conversation (made by a merge)? */
export function isMirrorId(id) {
  return typeof id === 'string' && id.includes(MIRROR_MARK);
}

/** The id of device `deviceId`'s version of conversation `id`, kept next to this device's own. */
export function mirrorIdOf(id, deviceId) {
  return `${id}${MIRROR_MARK}${deviceId}`;
}

/** The title of that version: "<title> (from Mac)". */
export function mirrorTitle(title, label) {
  const t = typeof title === 'string' && title.trim() ? title.trim() : 'Conversation';
  return `${t} (from ${cleanLine(label, LABEL_MAX) || 'another device'})`;
}

/**
 * The text whose hash tells whether this device's backup changed since the last upload: the export
 * without its exportedAt (the only part that changes on every export).
 */
export function fingerprintText(json) {
  return typeof json === 'string' ? json.replace(/"exportedAt":"[^"]*",?/, '') : '';
}

/** UTF-8 size of a string (what the Core counts), without encoding it. */
export function utf8Bytes(s) {
  if (typeof s !== 'string') return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

function timeOf(v) {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * GET api/sync's answer, checked: { devices: [{ id, label, updatedAt (the Core's ISO text), at (ms
 * or null), bytes (number or null) }] }, newest first; null when it isn't that shape.
 */
export function syncDevicesView(data) {
  if (!isObj(data) || !Array.isArray(data.devices)) return null;
  const devices = [];
  const seen = new Set();
  for (const d of data.devices) {
    if (!isObj(d) || !validDeviceId(d.id) || seen.has(d.id)) continue;
    seen.add(d.id);
    const updatedAt = typeof d.updatedAt === 'string' ? d.updatedAt.slice(0, 40) : '';
    devices.push({
      id: d.id,
      label: cleanLine(d.label, LABEL_MAX) || 'Device',
      updatedAt,
      at: timeOf(updatedAt),
      bytes: typeof d.bytes === 'number' && Number.isFinite(d.bytes) && d.bytes >= 0 ? d.bytes : null,
    });
  }
  devices.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return { devices };
}

/**
 * The other devices whose backup changed since this device last merged it: `merged` maps a device
 * id to the updatedAt last merged. (Any change counts, not only a newer time: merging is idempotent.)
 */
export function devicesToPull(devices, { selfId, merged } = {}) {
  const m = isObj(merged) ? merged : {};
  return (Array.isArray(devices) ? devices : []).filter((d) => d && d.id !== selfId && d.updatedAt && m[d.id] !== d.updatedAt);
}

function turnIds(c) {
  return new Set((c && Array.isArray(c.turnIds) ? c.turnIds : []).filter((id) => typeof id === 'string'));
}

/**
 * What to do with another device's conversation. remote: { id, updatedAt, turnIds }; local: the
 * same for this device's copy, or null; known: this device had that id before; busy: it is running
 * here (or in another window) right now.
 *   'pass'      another device's version of a conversation (MIRROR_MARK): never passed on
 *   'deleted'   missing here, but this device had it: the owner deleted it here, so it stays away
 *   'add'       missing here: added
 *   'busy'      running here: left for the next sync
 *   'same'      the same version
 *   'replace'   the other device's is newer and has every turn this one has: it replaces it
 *   'mirror'    the two went different ways: theirs is kept next to this device's own
 *   'older'     this device's is newer and has every turn of theirs: nothing to do
 */
export function conversationAction({ remote, local, known = false, busy = false } = {}) {
  if (!isObj(remote) || typeof remote.id !== 'string' || !remote.id) return 'pass';
  if (isMirrorId(remote.id)) return 'pass';
  if (!isObj(local)) return known ? 'deleted' : 'add';
  if (remote.updatedAt === local.updatedAt) return 'same';
  if (busy) return 'busy';
  const mine = turnIds(local);
  const theirs = turnIds(remote);
  if (remote.updatedAt > local.updatedAt) {
    for (const id of mine) if (!theirs.has(id)) return 'mirror';
    return 'replace';
  }
  for (const id of theirs) if (!mine.has(id)) return 'mirror';
  return 'older';
}

/**
 * What to do with another device's version of a conversation that went a different way (see
 * 'mirror' above), given this device's copy of that version (null when there is none yet).
 */
export function mirrorAction({ remote, mirror, known = false } = {}) {
  if (!isObj(mirror)) return known ? 'deleted' : 'add';
  return remote && remote.updatedAt > mirror.updatedAt ? 'replace' : 'same';
}

// ---- words ---------------------------------------------------------------------------------------

export const SYNC_OLD_CORE = 'Your home base needs Jarvis Core 1.1 to keep your devices in sync. On the Alienware, run jarvis-core update (or wait for it to update itself).';
export const SYNC_UNREACHABLE = 'Can’t reach the home base right now, so this device wasn’t synced. Is Tailscale switched on here, and is the Alienware on? Jarvis tries again by itself.';

/** "51 MB" (decimal, like disks). */
export function formatMegabytes(bytes) {
  const b = typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? bytes : 0;
  const mb = b / 1e6;
  return mb >= 10 ? `${Math.round(mb)} MB` : mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}

/**
 * A sync failure in a sentence: { state, message }. `f` is a client failure ({ kind, status, code,
 * message }) or { kind: 'toobig', bytes }.
 *   state: 'old' (a Core 1.0: no api/sync) | 'toobig' | 'offline' | 'down' | 'refused' | 'starting' |
 *          'rate' | 'busy' | 'full' | 'error'
 */
export function syncProblem(f) {
  const x = isObj(f) ? f : {};
  const said = cleanLine(x.message, 160);
  if (x.kind === 'toobig' || x.status === 413 || x.code === 'too_large') {
    const size = typeof x.bytes === 'number' ? ` (${formatMegabytes(x.bytes)})` : '';
    return { state: 'toobig', message: `This device’s backup is too big to sync${size}: the home base keeps backups up to 50 MB. Conversations with many photos take the most room; Settings → Data → Export still saves everything to a file.` };
  }
  if (x.kind === 'http' && x.status === 404) return { state: 'old', message: SYNC_OLD_CORE };
  if (x.kind === 'http' && x.status === 503 && x.code === 'sync_unavailable') return { state: 'old', message: SYNC_OLD_CORE };
  switch (x.kind) {
    case 'unreachable':
    case 'aborted':
      return { state: 'offline', message: SYNC_UNREACHABLE };
    case 'down':
      return { state: 'down', message: 'The Alienware answered, but Jarvis Core isn’t responding, so this device wasn’t synced. It restarts by itself; Jarvis tries again later.' };
    case 'refused':
      return { state: 'refused', message: `The home base refused the sync${said ? ` (it said: ${said})` : ''}. Check that Tailscale is on and signed in here.` };
    case 'starting':
      return { state: 'starting', message: 'The home base is starting up. Jarvis syncs again in a moment.' };
    case 'rate':
      return { state: 'rate', message: 'The home base asked Jarvis to slow down. It syncs again in a few minutes.' };
    default:
      break;
  }
  if (x.status === 409 || x.code === 'busy') return { state: 'busy', message: 'Another upload from this device is still going. Jarvis tries again in a minute.' };
  if (x.status === 507 || x.code === 'disk_full') return { state: 'full', message: 'The home base’s drive is nearly full, so it didn’t keep this backup. Free some space on the Alienware.' };
  if (x.kind === 'notcore') return { state: 'error', message: 'That address answered, but it isn’t a Jarvis Core. Check the address in Settings → Home base.' };
  return { state: 'error', message: said ? `The sync didn’t work: ${said}` : 'The sync didn’t work. Jarvis tries again later.' };
}

/** "Last synced 7:42 AM" / "Last synced Nov 24, 7:42 PM" / "Not synced yet". */
export function lastSyncedText(at, now = Date.now()) {
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return 'Not synced yet';
  try {
    const d = new Date(at);
    const today = new Date(now);
    const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return sameDay ? `Last synced ${time}` : `Last synced ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  } catch {
    return 'Last synced';
  }
}
