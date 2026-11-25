// App settings (SPEC §5): validated, clamped, persisted in localStorage with an
// in-memory fallback, and broadcast to listeners (including changes made in other tabs).
//
//   getSettings()        -> current settings (frozen; the same object until something changes)
//   saveSettings(patch)  -> shallow merge (deep for `features`), validate, persist, notify; returns new settings
//   onSettingsChange(fn) -> fn(settings) after every change; returns unsubscribe
//   resetSettings()      -> back to DEFAULT_SETTINGS
//
// Validation never throws: an invalid stored value falls back to its default, and an
// invalid value in a patch keeps the current value. Numbers are clamped to their range.

import { MODELS, DEPTHS, MODES } from '../engine/models.js';
import { normalizeHomeBaseUrl } from '../lib/homebase.js';
import { readItem, writeItem, removeItem, watchItem } from './storage.js';
import { isPlainObject, clamp, toFiniteNumber, cleanLine, createEmitter, parseJson } from './util.js';

export const SETTINGS_KEY = 'jarvis.settings.v1';

export const DEFAULT_SETTINGS = deepFreeze({
  userName: '', // '' means address the owner as "sir"
  leadModel: 'claude-opus-5-5',
  workerModel: 'claude-sonnet-5-5',
  depth: 'balanced', // 'fast' | 'balanced' | 'deep'
  mode: 'auto', // default composer mode: 'auto' | 'quick' | 'swarm'
  maxAgents: 8, // per wave, 1..20
  maxParallel: 4, // concurrent worker requests, 1..10
  maxWaves: 3, // deploy_agents calls per turn, 1..4
  showThinking: true, // request summarized thinking and show it
  speakReplies: 'off', // 'off' | 'summary' | 'full'
  voiceURI: '', // '' = auto-pick
  voiceRate: 1.0, // 0.7..1.5
  listenLang: '', // the language spoken to the microphone; '' = this device's language (v7.2)
  location: '', // free text, e.g. "Austin, Texas, US" ('' = not shared)
  memoryEnabled: true,
  spendWarnUsd: 20, // monthly estimate warning threshold; 0 = off
  onboarded: false,
  features: { fallbacks: true, compaction: true }, // auto-disabled after a 400 naming them
  // Feature pack v1.1 (SPEC §14) and wave B (SPEC §15.1).
  followups: true, // suggest follow-up questions after each answer (Claude Haiku)
  tone: 'butler', // Jarvis's style: 'butler' | 'friendly' | 'professional' | 'playful'
  verbosity: 'balanced', // 'concise' | 'balanced' | 'detailed'
  theme: 'arc', // arc | ember | verdant | aurora | solar | mono (src/ui/themes.js)
  sounds: true,
  soundVolume: 0.6, // 0..1
  haptics: true,
  notifyOnFinish: true, // notify when a long mission finishes in the background
  voiceContinuous: true, // Voice Mode keeps listening after each spoken reply
  // Natural voice (Kokoro-82M in a Worker, platform/voice/natural/): off until the owner opts in
  // and the model is downloaded; the device voice (voiceURI) stays the fallback.
  naturalVoice: false,
  naturalVoiceId: 'bm_george', // a Kokoro voice id (platform/voice/natural/catalog.js)
  // Optics: the camera the owner chose last on this device (the picker or Flip). Device ids are
  // per site and per browser; the label is the fallback when the id changes ('' = the default camera).
  opticsCameraId: '',
  opticsCameraLabel: '',
  // Listening (v7.2): the silence that tells Jarvis the owner has finished ('short' 1.0 s, 'normal'
  // 1.6 s, 'long' 2.6 s; platform/voice/stt.js LISTEN_WAITS), and what happens then: 'show' what was
  // heard for 2 seconds (tap to fix it, "no, I said …", "cancel"), then send; or send it 'now'.
  listenWait: 'normal',
  listenSend: 'show',
  // Wake Jarvis (Standby, SPEC §22): while the Standby screen is open, Jarvis listens on this device
  // for two claps (or snaps) and, once its ~15 MB download is on, for "Hey Jarvis"; nothing leaves the
  // device until he is woken. After a conversation he goes back to Standby (wakeReturn).
  wakeClap: true,
  wakeClapSensitivity: 'normal', // 'low' | 'normal' | 'high' (src/lib/wake/clap.js)
  wakeWord: false, // the "Hey Jarvis" models download only when the owner turns this on
  wakeReturn: true,
  // Home base (v7.5, SPEC §23): the Jarvis Core's Tailscale address, 'https://<machine>.<tailnet>.ts.net/'
  // ('' = not linked). Stored normalized (src/lib/homebase.js normalizeHomeBaseUrl); anything else is refused.
  homeBaseUrl: '',
});

/** Valid ranges, exported so the Settings UI can use the same bounds for its inputs. */
export const SETTINGS_LIMITS = Object.freeze({
  userName: Object.freeze({ maxLength: 40 }),
  location: Object.freeze({ maxLength: 120 }),
  maxAgents: Object.freeze({ min: 1, max: 20 }),
  maxParallel: Object.freeze({ min: 1, max: 10 }),
  maxWaves: Object.freeze({ min: 1, max: 4 }),
  voiceRate: Object.freeze({ min: 0.7, max: 1.5 }),
  spendWarnUsd: Object.freeze({ min: 0, max: 100000 }),
  soundVolume: Object.freeze({ min: 0, max: 1 }),
});

/** Allowed values of the enumerated wave-B settings (the Settings UI labels them). */
export const TONES = Object.freeze(['butler', 'friendly', 'professional', 'playful']);
export const VERBOSITIES = Object.freeze(['concise', 'balanced', 'detailed']);

// Enumerations come from the engine's tables (single source of truth), with the SPEC
// values as a safety net if a table is ever empty.
const MODEL_IDS = idsOf(MODELS, ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
// Jarvis (the lead) can't run on Claude Haiku 5.5: its frozen web tools use the dynamic-filtering
// versions, which Haiku doesn't support. Haiku stays available as an agent model.
const isHaiku = (id) => typeof id === 'string' && ((isPlainObject(MODELS) && MODELS[id] && MODELS[id].bucket === 'haiku') || /haiku/i.test(id));
/** Models that can lead the conversation (every model except Haiku), for the Settings UI. */
export const LEAD_MODEL_IDS = Object.freeze(MODEL_IDS.filter((id) => !isHaiku(id)));
const LEAD_FROM_HAIKU = LEAD_MODEL_IDS.includes('claude-sonnet-5-5') ? 'claude-sonnet-5-5' : DEFAULT_SETTINGS.leadModel;
const DEPTH_IDS = idsOf(DEPTHS, ['fast', 'balanced', 'deep']);
const MODE_IDS = idsOf(MODES, ['auto', 'quick', 'swarm']);
const SPEAK_MODES = ['off', 'summary', 'full'];
const LISTEN_WAIT_IDS = ['short', 'normal', 'long'];
const LISTEN_SEND_IDS = ['show', 'now'];
const CLAP_SENSITIVITY_IDS = ['low', 'normal', 'high'];
const FEATURE_KEYS = Object.keys(DEFAULT_SETTINGS.features);

function idsOf(table, fallback) {
  const ids = isPlainObject(table) ? Object.keys(table) : [];
  return ids.length ? ids : fallback;
}

// ---- validators: (value, fallback) -> valid value --------------------------------

const oneOf = (list) => (v, fb) => (typeof v === 'string' && list.includes(v) ? v : fb);
const bool = (v, fb) => (typeof v === 'boolean' ? v : fb);
const intIn = ({ min, max }) => (v, fb) => {
  const n = toFiniteNumber(v);
  return n === null ? fb : clamp(Math.round(n), min, max);
};
const decimalIn = ({ min, max }, places) => (v, fb) => {
  const n = toFiniteNumber(v);
  if (n === null) return fb;
  const f = 10 ** places;
  return clamp(Math.round(n * f) / f, min, max);
};
const line = ({ maxLength }) => (v, fb) => (typeof v === 'string' ? cleanLine(v, maxLength) : fb);
const voiceUri = (v, fb) => (typeof v === 'string' ? cleanLine(v, 400) : fb);
// A language tag, or '' for this device's language (the listening language's default since v7.2).
const lang = (v, fb) => {
  if (typeof v !== 'string') return fb;
  const s = v.trim().replace(/_/g, '-');
  if (s === '') return '';
  return s.length <= 35 && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/.test(s) ? s : fb;
};
// A stored or imported Haiku lead (from before this rule) becomes Sonnet 5.5.
const leadModel = (v, fb) => {
  if (MODEL_IDS.includes(v)) return isHaiku(v) ? LEAD_FROM_HAIKU : v;
  return isHaiku(fb) ? LEAD_FROM_HAIKU : fb;
};
const features = (v, fb) => {
  const out = {};
  for (const key of FEATURE_KEYS) out[key] = isPlainObject(v) && typeof v[key] === 'boolean' ? v[key] : fb[key];
  return out;
};

const VALIDATORS = {
  userName: line(SETTINGS_LIMITS.userName),
  leadModel,
  workerModel: oneOf(MODEL_IDS),
  depth: oneOf(DEPTH_IDS),
  mode: oneOf(MODE_IDS),
  maxAgents: intIn(SETTINGS_LIMITS.maxAgents),
  maxParallel: intIn(SETTINGS_LIMITS.maxParallel),
  maxWaves: intIn(SETTINGS_LIMITS.maxWaves),
  showThinking: bool,
  speakReplies: oneOf(SPEAK_MODES),
  voiceURI: voiceUri,
  voiceRate: decimalIn(SETTINGS_LIMITS.voiceRate, 2),
  listenLang: lang,
  location: line(SETTINGS_LIMITS.location),
  memoryEnabled: bool,
  spendWarnUsd: decimalIn(SETTINGS_LIMITS.spendWarnUsd, 2),
  onboarded: bool,
  features,
  followups: bool,
  tone: oneOf(TONES),
  verbosity: oneOf(VERBOSITIES),
  // Theme ids are validated loosely here (platform knows nothing about the UI's theme list);
  // applyTheme() falls back to the default theme for an unknown id.
  theme: (v, fb) => (typeof v === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(v) ? v : fb),
  sounds: bool,
  soundVolume: decimalIn(SETTINGS_LIMITS.soundVolume, 2),
  haptics: bool,
  notifyOnFinish: bool,
  voiceContinuous: bool,
  naturalVoice: bool,
  // Kokoro voice ids look like 'bm_george' (language+gender letter, underscore, name).
  naturalVoiceId: (v, fb) => (typeof v === 'string' && /^[a-z]{2}_[a-z]{2,20}$/.test(v) ? v : fb),
  opticsCameraId: (v, fb) => (typeof v === 'string' && v.length <= 256 && /^[\x21-\x7e]*$/.test(v) ? v : fb),
  opticsCameraLabel: line({ maxLength: 120 }),
  listenWait: oneOf(LISTEN_WAIT_IDS),
  listenSend: oneOf(LISTEN_SEND_IDS),
  wakeClap: bool,
  wakeClapSensitivity: oneOf(CLAP_SENSITIVITY_IDS),
  wakeWord: bool,
  wakeReturn: bool,
  // '' unlinks; an address is kept only as https on a *.ts.net name, normalized (no path, no port).
  homeBaseUrl: (v, fb) => {
    if (typeof v !== 'string') return fb;
    if (v.trim() === '') return '';
    const r = normalizeHomeBaseUrl(v);
    return r.ok ? r.url : fb;
  },
};

/**
 * Build a complete, valid settings object from `input`, using `base` (a valid
 * settings object) for anything missing or invalid. Unknown keys are dropped.
 */
export function normalizeSettings(input, base = DEFAULT_SETTINGS) {
  const src = isPlainObject(input) ? input : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    out[key] = VALIDATORS[key](src[key], base[key]);
  }
  return deepFreeze(out);
}

// ---- state ------------------------------------------------------------------------

const changes = createEmitter('settings');
let current = null;

function load() {
  return normalizeSettings(migrate(parseJson(readItem(SETTINGS_KEY), null)), DEFAULT_SETTINGS);
}

/**
 * Stored settings from before v7.2 always carry listenLang 'en-US', the old default, whether the
 * owner chose it or not (every save writes every key): those now follow the device's language
 * (''). A store saved by v7.2 or later has listenWait, and keeps whatever it says.
 */
function migrate(raw) {
  if (!isPlainObject(raw) || 'listenWait' in raw || raw.listenLang !== 'en-US') return raw;
  return { ...raw, listenLang: '' };
}

/** The current settings (a frozen object; treat as read-only). */
export function getSettings() {
  if (!current) {
    current = load();
    // Another tab saved settings: adopt them and tell our listeners.
    watchItem(SETTINGS_KEY, () => {
      const next = load();
      if (!sameSettings(current, next)) {
        current = next;
        changes.emit(next);
      }
    });
  }
  return current;
}

/**
 * Merge `patch` into the settings (shallow, except `features` which merges per key),
 * validate and clamp, persist, notify listeners. Returns the new settings.
 * Invalid values in the patch are ignored (the current value is kept).
 */
export function saveSettings(patch) {
  const prev = getSettings();
  if (!isPlainObject(patch)) return prev;
  const merged = { ...prev, ...patch };
  merged.features = { ...prev.features, ...(isPlainObject(patch.features) ? patch.features : {}) };
  const next = normalizeSettings(merged, prev);
  if (sameSettings(prev, next)) return prev;
  current = next;
  writeItem(SETTINGS_KEY, JSON.stringify(next));
  changes.emit(next);
  return next;
}

/** Call fn(settings) after every change. Returns an unsubscribe function. */
export function onSettingsChange(fn) {
  return changes.on(fn);
}

/** Restore the defaults (removes the stored settings) and notify. Returns the new settings. */
export function resetSettings() {
  getSettings();
  removeItem(SETTINGS_KEY);
  const next = normalizeSettings({}, DEFAULT_SETTINGS);
  const changed = !sameSettings(current, next);
  current = next;
  if (changed) changes.emit(next);
  return next;
}

function sameSettings(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key === 'features') {
      for (const f of FEATURE_KEYS) if (a.features[f] !== b.features[f]) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function deepFreeze(obj) {
  for (const value of Object.values(obj)) if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  return Object.freeze(obj);
}
