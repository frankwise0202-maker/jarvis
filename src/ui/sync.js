// Sync through the home base in the app (v7.6, SPEC §24.7): this device's backup goes to the Jarvis
// Core and the other devices' backups come back and are merged in, so the iPhone and the Mac see the
// same conversations, saved holograms and blueprints, and remembered facts. Only ever adds (see
// src/lib/sync.js); never the API key; on by default once a home base is linked.
//
//   const sync = createSync({ getSettings, onSettingsChange, label, isBusy, onMerged, ...fakes for tests });
//   sync.start()                after the boot: a sync 3 s later, then every 10 minutes while the app is
//                               open (and on coming back to the front when one is due)
//   sync.noteChange()           something worth backing up changed: a sync 2 minutes after the last change
//                               (at once when the app goes to the background with a change waiting)
//   sync.syncNow({ reason })    -> Promise<state>; one sync at a time (also across windows: Web Locks)
//   sync.setEnabled(on) · sync.getState() · sync.subscribe(fn) -> unsubscribe · sync.destroy()
//   state = { phase: 'unset' | 'off' | 'idle' | 'syncing' | 'done' | 'failed', enabled, lastSyncedAt,
//             problem: { state, message } | null, devices: [other devices on the home base], added }
//   createSyncSettings(sync) -> { el, destroy }   Settings → Home base, below the brain
//
// A sync: GET api/sync (the devices) -> each other device whose backup changed since it was last
// merged: GET api/sync/<id>, merged (src/platform/backup.js mergeSyncedBackup) -> this device's
// export (buildSyncBackup): over 50 MB it is not sent ("too big"); unchanged since the last upload
// (its SHA-256 without exportedAt) and still on the Core: not sent; otherwise PUT api/sync/<id>,
// gzip-compressed where the browser can. What this device has had (`known`) is remembered, so
// something deleted here is never brought back by another device's copy.
//
// All text reaches the page through dom.js helpers (textContent). Never innerHTML.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { listSyncDevices, downloadSyncBackup, uploadSyncBackup, gzipText, sha256Hex } from '../platform/sync.js';
import { buildSyncBackup, mergeSyncedBackup } from '../platform/backup.js';
import { newDeviceId, validDeviceId, devicesToPull, fingerprintText, utf8Bytes, syncProblem, lastSyncedText, SYNC_MAX_BYTES, SYNC_INTERVAL_MS, SYNC_DEBOUNCE_MS } from '../lib/sync.js';

export const SYNC_KEY = 'jarvis.sync.v1';
export const SYNC_KNOWN_KEY = 'jarvis.sync.known.v1';
const START_DELAY_MS = 3000;
const TICK_MS = 60 * 1000;
const RELINK_DELAY_MS = 1500;
const KNOWN_MAX = 20000; // ids remembered per kind (the oldest go first)
const REBUILD_MS = 60 * 60 * 1000; // with no change noted, the export is still re-checked hourly

const realClient = { list: listSyncDevices, download: downloadSyncBackup, upload: uploadSyncBackup };
const realData = { build: buildSyncBackup, merge: mergeSyncedBackup };

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] sync:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

function localStore() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readJson(storage, key) {
  try {
    const raw = storage ? storage.getItem(key) : null;
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (storage) storage.setItem(key, JSON.stringify(value));
  } catch {
    /* full or unavailable: sync still works for this session */
  }
}

function defaultRandom(n) {
  const out = new Uint8Array(n);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') globalThis.crypto.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function defaultLocks() {
  try {
    return typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null;
  } catch {
    return null;
  }
}

const defaultTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

function byteLength(text) {
  try {
    if (typeof Blob === 'function') return new Blob([text]).size;
  } catch {
    /* fall through */
  }
  return utf8Bytes(text);
}

export function createSync({
  getSettings,
  onSettingsChange,
  client = realClient,
  data = realData,
  storage = localStore(),
  hash = sha256Hex,
  gzip = gzipText,
  now = () => Date.now(),
  label = 'Browser',
  isBusy = () => false,
  onMerged = null,
  randomBytes = defaultRandom,
  locks = defaultLocks(),
  timers = defaultTimers,
  doc = typeof document !== 'undefined' ? document : null,
  startDelayMs = START_DELAY_MS,
} = {}) {
  const listeners = new Set();
  const rec = loadRec();
  let known = loadKnown();
  let url = currentUrl();
  let running = null;
  let pendingChange = false;
  let lastChangeAt = 0;
  // Something may differ from the last upload: the export is built (and hashed) only then, so an idle
  // app doesn't read a big history every 10 minutes. True at start (the first sync always checks).
  let dirty = true;
  let changes = 0; // counts noted changes: one noted while a sync runs keeps `dirty` for the next
  let suppress = 0; // > 0 while a merge writes: its own changes are not "changes" to upload again
  let debounce = null;
  let startTimer = null;
  let tickTimer = null;
  let relinkTimer = null;
  let started = false;
  let destroyed = false;
  let state = {
    phase: !url ? 'unset' : rec.enabled ? 'idle' : 'off',
    enabled: rec.enabled,
    lastSyncedAt: rec.lastSyncedAt || null,
    problem: null,
    devices: [],
    added: null,
  };

  function currentUrl() {
    const s = safe(() => getSettings(), null);
    return s && typeof s.homeBaseUrl === 'string' ? s.homeBaseUrl : '';
  }

  function loadRec() {
    const r = readJson(storage, SYNC_KEY) || {};
    return {
      deviceId: validDeviceId(r.deviceId) ? r.deviceId : '',
      enabled: r.enabled !== false, // on by default
      lastSyncedAt: typeof r.lastSyncedAt === 'number' ? r.lastSyncedAt : null,
      lastAttemptAt: typeof r.lastAttemptAt === 'number' ? r.lastAttemptAt : 0,
      upload: r.upload && typeof r.upload.fingerprint === 'string' ? { fingerprint: r.upload.fingerprint, at: Number(r.upload.at) || 0, bytes: Number(r.upload.bytes) || 0 } : null,
      merged: r.merged && typeof r.merged === 'object' && !Array.isArray(r.merged) ? { ...r.merged } : {},
      tooBig: typeof r.tooBig === 'number' && r.tooBig > 0 ? r.tooBig : 0, // the size of the export that was too big
    };
  }

  function saveRec() {
    writeJson(storage, SYNC_KEY, rec);
  }

  function loadKnown() {
    const k = readJson(storage, SYNC_KNOWN_KEY) || {};
    const list = (v) => new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    return { conv: list(k.conv), lib: list(k.lib), mem: list(k.mem) };
  }

  function addKnown(ids) {
    if (!ids || typeof ids !== 'object') return;
    let changed = false;
    for (const kind of ['conv', 'lib', 'mem']) {
      const set = known[kind];
      for (const id of Array.isArray(ids[kind]) ? ids[kind] : []) {
        if (typeof id !== 'string' || !id || set.has(id)) continue;
        set.add(id);
        changed = true;
      }
      while (set.size > KNOWN_MAX) set.delete(set.values().next().value);
    }
    if (changed) writeJson(storage, SYNC_KNOWN_KEY, { conv: [...known.conv], lib: [...known.lib], mem: [...known.mem] });
  }

  function deviceId() {
    if (!rec.deviceId) {
      rec.deviceId = newDeviceId(randomBytes(12));
      saveRec();
    }
    return rec.deviceId;
  }

  function set(patch) {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) safe(() => fn(state));
  }

  function ready() {
    return !destroyed && !!url && rec.enabled;
  }

  function visible() {
    return !doc || doc.visibilityState !== 'hidden';
  }

  function fail(f, extra = {}) {
    set({ phase: 'failed', problem: syncProblem(f), ...extra });
  }

  function withLock(fn) {
    if (locks) {
      try {
        // One sync at a time across this device's windows (they share the same data): another
        // window already syncing means this one has nothing to add.
        return locks.request('jarvis-sync', { ifAvailable: true }, (lock) => (lock ? fn() : 'locked'));
      } catch {
        /* fall through */
      }
    }
    return fn();
  }

  async function cycle() {
    const base = url;
    if (!base) {
      set({ phase: 'unset' });
      return;
    }
    // Another window of this device may have synced (or switched sync off) since: they share this
    // device's data, so start from what is stored (when anything is).
    if (readJson(storage, SYNC_KEY)) {
      Object.assign(rec, loadRec());
      known = loadKnown();
    }
    if (!rec.enabled) {
      set({ phase: 'off', enabled: false });
      return;
    }
    const selfId = deviceId();
    const stale = () => destroyed || url !== base || !rec.enabled;
    pendingChange = false;
    if (debounce) timers.clearTimeout(debounce);
    debounce = null;
    rec.lastAttemptAt = now();
    saveRec();
    set({ phase: 'syncing' });

    const listed = await client.list(base);
    if (stale()) return;
    if (!listed.ok) {
      fail(listed);
      return;
    }
    set({ devices: listed.devices.filter((d) => d.id !== selfId) });

    // Theirs, merged in.
    let pullProblem = null;
    const added = { conversations: 0, library: 0, memory: 0 };
    for (const d of devicesToPull(listed.devices, { selfId, merged: rec.merged })) {
      const got = await client.download(base, d.id);
      if (stale()) return;
      if (!got.ok) {
        if (!(got.kind === 'http' && got.status === 404)) pullProblem = pullProblem || got; // 404: listed, then gone
        continue;
      }
      let res = null;
      suppress++;
      try {
        res = await data.merge(got.data, { from: d.id, label: d.label, known, isBusy });
      } catch (err) {
        safe(() => console.warn('[jarvis] sync: could not merge a backup:', err && err.message));
        // Its own words (an import's: "made by a newer version of Jarvis…", "isn't a Jarvis backup").
        const why = err && typeof err.message === 'string' ? err.message : '';
        pullProblem = pullProblem || { kind: 'damaged', message: `${d.label}’s backup couldn’t be merged${why ? `: ${why}` : ''}` };
        rec.merged[d.id] = d.updatedAt; // not downloaded again until that device uploads a new one
        saveRec();
        continue;
      } finally {
        suppress--;
      }
      addKnown(res.written);
      if (!res.busy) rec.merged[d.id] = d.updatedAt; // a conversation running here: merged next time
      saveRec();
      added.conversations += res.conversations.length;
      added.library += res.library || 0;
      added.memory += res.memory || 0;
      if (res.conversations.length || res.library || res.memory) safe(() => typeof onMerged === 'function' && onMerged(res));
    }
    if (stale()) return;

    // Ours, sent when it changed.
    const someAdded = added.conversations + added.library + added.memory > 0 ? added : null;
    const onCore = listed.devices.some((d) => d.id === selfId);
    if (!dirty && !someAdded && rec.tooBig) {
      fail({ kind: 'toobig', bytes: rec.tooBig }); // still too big: nothing changed since it was checked
      return;
    }
    if (!dirty && !someAdded && onCore && rec.upload && now() - rec.upload.at < REBUILD_MS) {
      rec.lastSyncedAt = now();
      saveRec();
      set({ phase: pullProblem ? 'failed' : 'done', problem: pullProblem ? syncProblem(pullProblem) : null, lastSyncedAt: rec.lastSyncedAt, added: null });
      return;
    }
    const seenChanges = changes; // what this export covers
    const built = await data.build();
    if (stale()) return;
    addKnown(built.ids); // everything in it counts as this device's (a deletion later stays deleted)
    const bytes = byteLength(built.json);
    if (bytes > SYNC_MAX_BYTES) {
      if (changes === seenChanges) dirty = false; // checked: not built again until something changes
      rec.tooBig = bytes;
      saveRec();
      fail({ kind: 'toobig', bytes }, { added: someAdded });
      return;
    }
    const fingerprint = await hash(fingerprintText(built.json));
    if (!(rec.upload && rec.upload.fingerprint === fingerprint && onCore)) {
      const gz = await gzip(built.json);
      if (stale()) return;
      const up = await client.upload(base, selfId, built.json, { label, gzipped: gz });
      if (stale()) return;
      if (!up.ok) {
        fail(up, { added: someAdded });
        return;
      }
      rec.upload = { fingerprint, at: now(), bytes };
    }
    if (changes === seenChanges) dirty = false; // everything noted so far is on the Core now
    rec.tooBig = 0;
    rec.lastSyncedAt = now();
    saveRec();
    set({ phase: pullProblem ? 'failed' : 'done', problem: pullProblem ? syncProblem(pullProblem) : null, lastSyncedAt: rec.lastSyncedAt, added: someAdded });
  }

  // `reason` ('open' | 'change' | 'interval' | 'leave' | 'linked' | 'on' | 'manual') is for tests and logs.
  function syncNow() {
    if (destroyed) return Promise.resolve(state);
    if (running) return running;
    running = (async () => {
      try {
        await withLock(cycle);
      } catch (err) {
        safe(() => console.warn('[jarvis] sync failed:', err && err.message));
        fail({ kind: 'error' });
      } finally {
        running = null;
      }
      if (state.phase === 'syncing') set({ phase: rec.lastSyncedAt ? 'done' : 'idle' }); // another window synced
      return state;
    })();
    return running;
  }

  function tick() {
    if (!ready() || !visible() || running) return;
    const t = now();
    if (pendingChange && t - lastChangeAt >= SYNC_DEBOUNCE_MS) syncNow({ reason: 'change' });
    else if (t - (rec.lastAttemptAt || 0) >= SYNC_INTERVAL_MS) syncNow({ reason: 'interval' });
  }

  function onVisibility() {
    if (!visible()) {
      // Going to the background with a change waiting: send it now (the phone may not come back soon).
      if (pendingChange && ready()) syncNow({ reason: 'leave' });
      return;
    }
    tick(); // back at the front: a sync that came due meanwhile runs now
  }

  function noteChange() {
    if (suppress > 0 || destroyed) return;
    dirty = true;
    changes++;
    pendingChange = true;
    lastChangeAt = now();
    if (debounce) timers.clearTimeout(debounce);
    debounce = timers.setTimeout(() => {
      debounce = null;
      if (ready() && visible()) syncNow({ reason: 'change' });
    }, SYNC_DEBOUNCE_MS);
  }

  function start() {
    if (started || destroyed) return;
    started = true;
    startTimer = timers.setTimeout(() => {
      startTimer = null;
      if (ready()) syncNow({ reason: 'open' });
    }, startDelayMs);
    tickTimer = timers.setInterval(tick, TICK_MS);
    if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);
  }

  function setEnabled(on) {
    rec.enabled = !!on;
    saveRec();
    set({ enabled: rec.enabled, phase: !url ? 'unset' : rec.enabled ? 'idle' : 'off', problem: rec.enabled ? state.problem : null });
    if (rec.enabled && url) syncNow({ reason: 'on' });
  }

  const offSettings =
    typeof onSettingsChange === 'function'
      ? safe(
          () =>
            onSettingsChange(() => {
              const next = currentUrl();
              if (next === url) return;
              url = next;
              if (relinkTimer) timers.clearTimeout(relinkTimer);
              relinkTimer = null;
              set({ phase: !url ? 'unset' : rec.enabled ? 'idle' : 'off', problem: null, devices: [], added: null });
              // Linked (or pointed at another home base): sync soon, on by default.
              if (url && rec.enabled && started) {
                relinkTimer = timers.setTimeout(() => {
                  relinkTimer = null;
                  if (ready()) syncNow({ reason: 'linked' });
                }, RELINK_DELAY_MS);
              }
            }),
          null,
        )
      : null;

  return {
    start,
    noteChange,
    syncNow,
    setEnabled,
    getState: () => state,
    deviceId: () => rec.deviceId,
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      destroyed = true;
      for (const t of [debounce, startTimer, relinkTimer]) if (t) timers.clearTimeout(t);
      if (tickTimer) timers.clearInterval(tickTimer);
      if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVisibility);
      if (typeof offSettings === 'function') safe(() => offSettings());
      listeners.clear();
    },
  };
}

// ---- Settings → Home base: the sync card ----------------------------------------------------------

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function whenShort(ms) {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  } catch {
    return '';
  }
}

/** What a sync brought in, in words ("2 conversations and 1 saved hologram or blueprint"), or ''. */
export function addedText(added) {
  if (!added) return '';
  const parts = [];
  if (added.conversations) parts.push(plural(added.conversations, 'conversation', 'conversations'));
  if (added.library) parts.push(plural(added.library, 'saved hologram or blueprint', 'saved holograms and blueprints'));
  if (added.memory) parts.push(plural(added.memory, 'remembered fact', 'remembered facts'));
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function createSyncSettings(sync) {
  const toggle = h('input', {
    class: 'switch',
    type: 'checkbox',
    id: 'set-homeBaseSync',
    checked: !!sync.getState().enabled,
    attrs: { role: 'switch', 'data-testid': 'sync-enabled' },
    on: { change: () => sync.setEnabled(toggle.checked) },
  });
  const status = h('p', { class: 'key-result sync-status', attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'sync-status' } });
  const devicesLine = h('p', { class: 'set-help sync-devices', hidden: true, attrs: { 'data-testid': 'sync-devices' } });
  const nowBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'sync-now' }, on: { click: () => sync.syncNow({ reason: 'manual' }) } }, icon('refresh', { size: 14 }), h('span', { text: 'Sync now' }));
  const nowLabel = nowBtn.querySelector('span');
  const el = h(
    'div',
    { class: 'set-card brain-card sync-card', hidden: true, attrs: { 'data-testid': 'sync-settings' } },
    h('h4', { class: 'set-subtitle', text: 'Your devices, in sync' }),
    h(
      'div',
      { class: 'set-row' },
      h('div', { class: 'set-row-text' }, h('label', { class: 'set-label', attrs: { for: 'set-homeBaseSync' }, text: 'Keep this device in sync through the home base' })),
      h('div', { class: 'set-row-control' }, toggle),
    ),
    h('p', { class: 'set-help', text: 'Your conversations, saved holograms and blueprints, and what Jarvis remembers travel between your devices through your home base, which also keeps a backup of each day for two weeks. Syncing only ever adds: nothing is deleted anywhere, and your API key never leaves this device.' }),
    status,
    devicesLine,
    h('div', { class: 'set-row-actions set-row-actions--start' }, nowBtn),
  );

  function line(tone, text) {
    status.hidden = !text;
    status.dataset.tone = tone;
    status.replaceChildren(...(text ? [icon(tone === 'ok' ? 'check' : tone === 'busy' ? 'spinner' : tone === 'info' ? 'info' : 'alert', { size: 16 }), h('span', { text })] : []));
  }

  function render(st) {
    el.hidden = st.phase === 'unset';
    if (el.hidden) return;
    toggle.checked = !!st.enabled;
    const syncing = st.phase === 'syncing';
    nowBtn.hidden = !st.enabled;
    nowBtn.disabled = syncing;
    setText(nowLabel, syncing ? 'Syncing…' : 'Sync now');
    const last = lastSyncedText(st.lastSyncedAt);
    const got = addedText(st.added);
    if (!st.enabled) line('info', 'Sync is off for this device. Its conversations stay here only (a backup file from Settings → Data still works).');
    else if (syncing) line('busy', 'Syncing with the home base…');
    else if (st.phase === 'failed' && st.problem) line(st.problem.state === 'old' || st.problem.state === 'toobig' ? 'warn' : 'err', `${st.problem.message}${st.lastSyncedAt ? ` (${last}.)` : ''}`);
    else if (st.phase === 'done') line('ok', `${last}.${got ? ` Brought in ${got} from your other devices.` : ''}`);
    else line('info', st.lastSyncedAt ? `${last}.` : 'Not synced yet. Jarvis syncs a few seconds after it opens, then every 10 minutes.');
    const others = Array.isArray(st.devices) ? st.devices : [];
    devicesLine.hidden = !st.enabled || !others.length;
    setText(devicesLine, others.length ? `Also on the home base: ${others.map((d) => `${d.label}${d.at ? ` (backed up ${whenShort(d.at)})` : ''}`).join(', ')}.` : '');
  }

  const off = sync.subscribe(render);
  render(sync.getState());
  return {
    el,
    destroy() {
      if (typeof off === 'function') off();
    },
  };
}
