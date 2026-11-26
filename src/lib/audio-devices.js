// Microphone and speaker on a computer (Settings → Voice, v8.1, SPEC §28.2 and §28.3): friendly names and
// connections for the audio devices Chrome lists, which device to use (the owner's remembered choice), the
// three setups for a Bluetooth speakerphone, what to do when a chosen device comes and goes, Standby's
// capture retries, and the hands-free Test's results. Pure: no DOM, no media APIs
// (src/platform/audio-devices.js feeds it).
//
//   audioTransport(label)                  the connection Chrome on a Mac writes after a device's name:
//                                          'bluetooth' | 'bluetooth-le' | 'builtin' | 'usb' | 'virtual' |
//                                          'aggregate' | 'hdmi' | 'displayport' | 'airplay' | 'thunderbolt' |
//                                          'pci' | 'firewire' | 'avb' | ''
//   describeAudioDevice(device)            one MediaDeviceInfo -> { id, groupId, kind, label, name,
//                                          transport, connection, isDefault }
//   listAudioDevices(devices)              -> { inputs, outputs, defaultInput, defaultOutput, labelled }
//   deviceTitle(device)                    "Desk Speakerphone · Bluetooth" (the name and the connection)
//   pickDevice(list, remembered)           by device id, then by label: { device, by, missing }
//   AUDIO_SETUPS, SETUP_IDS, RECOMMENDED_SETUP, BLUETOOTH_FACTS, AUDIO_NOTES
//   setupDevices(setup, devices, chosen)   the microphone and speaker a setup stores when the owner picks it
//   planSetup(setup, devices, chosen, gone) which device does what: { wakeMic, questionMic, speaker,
//                                          wakeProcessing, questionProcessing, missing, custom, ... }
//   audioConstraints(device, processing)   getUserMedia's audio constraints for a planned microphone
//   initialHotplugState() / audioHotplugPlan({ state, devices, chosen, now })
//                                          the two-enumeration rule: a chosen device counts as gone only when
//                                          two enumerations about 3 s apart both miss it
//   captureRetryDelay(attempt) / createBackoff(retry)   Standby's capture retries: 2 s, 5 s, 15 s, 60 s, then
//                                          every 5 minutes
//   clockJumped(lastAt, now, everyMs)      a long jump in Date.now(): the Mac slept
//   micPillName(device) / goneName(device) / awayLine(plan)   what the Standby pill and the wake line say
//   trackStartSupport(env)                 the recognizer hears a given track (recognition.start(track))
//   HANDS_FREE_TEST_KEY, normalizeHandsFreeTest(raw), handsFreeLines(result)
//   alwaysOnChecks(env), ALWAYS_ON_TOLD     A10's "Always on" card: what is checked, and what is only told
//   audioStatusLine(plan, devices)         "which microphone are you using?" (src/ui/commands/audio.js)
//
// Labels on a Mac carry the transport (Chromium media/audio/mac/core_audio_util_mac.cc): "MacBook Pro
// Microphone (Built-in)", "<speakerphone> (Bluetooth)", "(Bluetooth LE)", "(Virtual)", "(Aggregate)", and
// for USB the vendor:product id, "(0b0e:0422)". Chrome lists the system default again first, as "Default -
// <label>" with the id 'default' (and on Windows "Communications - …"). Before the microphone is allowed,
// labels and ids are empty: only "Default" can be offered then.

/** The setups (owner question 1: the recommended one is a constant, so a different answer is one line). */
export const SETUP_IDS = Object.freeze(['speaker-mac-mic', 'speakerphone-both', 'switch']);
export const RECOMMENDED_SETUP = 'speaker-mac-mic';

/** The three setups, in the card's words (README "Microphone and speaker (Mac)" says the same). */
export const AUDIO_SETUPS = Object.freeze(
  [
    {
      id: 'speaker-mac-mic',
      title: 'Speakerphone speaks, Mac listens',
      text: 'George always sounds his best, nothing switches, and “Hey Jarvis” can interrupt him. The Mac’s microphone hears you less well from across the room, and only with the lid open (a MacBook cuts its built-in microphone in hardware when the lid closes).',
    },
    {
      id: 'speakerphone-both',
      title: 'Speakerphone for both',
      text: 'Jarvis hears you best from across the room. George sounds like a phone call whenever its microphone is open (Standby listens all the time, so mostly), with a short gap at each switch.',
    },
    {
      id: 'switch',
      title: 'Switch',
      experimental: true,
      text: 'The Mac’s microphone waits for “Hey Jarvis”; your question is heard on the speakerphone’s microphone; George answers in full sound. A short gap at each switch.',
    },
  ].map((s) => Object.freeze({ ...s, recommended: s.id === RECOMMENDED_SETUP, experimental: !!s.experimental })),
);

/** The Bluetooth facts, said this way on the card and in the README. */
export const BLUETOOTH_FACTS = Object.freeze([
  'While any app on the Mac has the speakerphone’s Bluetooth microphone open, macOS switches it to its phone-call mode, and everything it plays sounds like a phone call (Apple: support.apple.com/102217). It switches back when the microphone closes, with a short gap (about a second).',
  'Standby keeps Jarvis’s microphone open all the time. Jarvis closes his question microphone while he speaks, and Standby lets go of its own at a wake. So if Jarvis listens through the speakerphone, George sounds like a phone call whenever Standby listens, and the speakerphone flips mode at every turn of a conversation.',
]);

export const CHROME_MIC_SETTINGS = 'chrome://settings/content/microphone';

export const AUDIO_NOTES = Object.freeze({
  macVoice: 'When George isn’t speaking, the Mac’s own voice uses the Mac’s sound output: System Settings → Sound.',
  lid: '“Speakerphone speaks, Mac listens” needs the lid open: a MacBook’s microphone is off while its lid is closed.',
  firstTime: 'Using a Bluetooth speakerphone? Set it up in Settings → Voice.',
  chromeMic: (name) => `Set Chrome’s microphone to ${name || 'the same microphone'}: this Chrome doesn’t let Jarvis hand its recognizer a microphone, so Chrome’s own choice is used for your questions. Paste this address into a new tab:`,
});

/** After a Bluetooth microphone closes, George waits this long before he starts (device test 1). */
export const SETTLE_MS = 800;
/** Two enumerations at least this far apart must both miss a device before it counts as gone. */
export const AUDIO_GONE_MS = 3000;
/** devicechange comes in bursts: enumerate once they settle. */
export const DEVICECHANGE_DEBOUNCE_MS = 250;
/** Setup 3: the listen chime waits for the new track's first sound, at most this long. */
export const SWITCH_CHIME_MAX_MS = 1200;

const TRANSPORTS = [
  // [suffix as Chrome writes it, id, the word the card shows]
  ['bluetooth le', 'bluetooth-le', 'Bluetooth'],
  ['bluetooth', 'bluetooth', 'Bluetooth'],
  ['built-in', 'builtin', 'Built-in'],
  ['virtual', 'virtual', 'Virtual'],
  ['autoaggregate', 'aggregate', 'Aggregate'],
  ['aggregate', 'aggregate', 'Aggregate'],
  ['hdmi', 'hdmi', 'HDMI'],
  ['displayport', 'displayport', 'DisplayPort'],
  ['airplay', 'airplay', 'AirPlay'],
  ['thunderbolt', 'thunderbolt', 'Thunderbolt'],
  ['pci', 'pci', 'PCI'],
  ['firewire', 'firewire', 'FireWire'],
  ['avb', 'avb', 'AVB'],
  ['usb', 'usb', 'USB'],
];
const CONNECTION = Object.fromEntries(TRANSPORTS.map(([, id, word]) => [id, word]));
const USB_ID = /\s*\(([0-9a-f]{4}):([0-9a-f]{4})\)\s*$/i;
const SUFFIX = /\s*\(([^()]*)\)\s*$/;
const PREFIX = /^(default|communications)\s+-\s+/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g;

export const isBluetooth = (transport) => transport === 'bluetooth' || transport === 'bluetooth-le';

function cleanText(s, max = 200) {
  return String(s == null ? '' : s)
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** The label without Chrome's "Default - " / "Communications - " prefix. */
function unprefixed(label) {
  return cleanText(label).replace(PREFIX, '');
}

/** The connection in a label's last parentheses ('' when it names none). */
export function audioTransport(label) {
  const l = unprefixed(label);
  if (USB_ID.test(l)) return 'usb';
  const m = SUFFIX.exec(l);
  if (!m) return '';
  const word = m[1].trim().toLowerCase();
  for (const [suffix, id] of TRANSPORTS) if (word === suffix) return id;
  return '';
}

/** A label without the prefix and the connection: the device's own name. */
function baseName(label) {
  const l = unprefixed(label);
  if (USB_ID.test(l)) return l.replace(USB_ID, '').trim();
  const m = SUFFIX.exec(l);
  if (m && audioTransport(l)) return l.slice(0, m.index).trim();
  return l;
}

/** A label to compare by: without the prefix, spaces and case. */
export function audioLabelKey(label) {
  return unprefixed(label).toLowerCase();
}

/**
 * One audioinput or audiooutput (a MediaDeviceInfo or a plain { kind, deviceId, groupId, label }) as the
 * card shows it. isDefault: Chrome's "Default - …" entry (id 'default'), not a device of its own.
 */
export function describeAudioDevice(device) {
  const d = device && typeof device === 'object' ? device : {};
  const kind = d.kind === 'audiooutput' ? 'audiooutput' : 'audioinput';
  const id = typeof d.deviceId === 'string' ? d.deviceId.slice(0, 256) : '';
  const groupId = typeof d.groupId === 'string' ? d.groupId.slice(0, 256) : '';
  const raw = typeof d.label === 'string' ? d.label : '';
  const label = cleanText(raw);
  const isDefault = id === 'default' || id === 'communications' || PREFIX.test(label);
  const transport = audioTransport(label);
  const name = cleanText(baseName(label), 80) || (kind === 'audiooutput' ? 'Speaker' : 'Microphone');
  return { id, groupId, kind, label: unprefixed(label), name, transport, connection: CONNECTION[transport] || '', isDefault };
}

/** "Desk Speakerphone · Bluetooth", "MacBook Pro Microphone · Built-in", "Speaker" (no connection known). */
export function deviceTitle(device) {
  if (!device) return '';
  return device.connection ? `${device.name} · ${device.connection}` : device.name;
}

/**
 * Every microphone and speaker, described, in the order the browser lists them; Chrome's default entries
 * are left out of the lists and named as defaultInput / defaultOutput (the device they stand for).
 * labelled: false before the microphone is allowed (no names to show: only "Default").
 */
export function listAudioDevices(devices) {
  const all = (Array.isArray(devices) ? devices : []).filter((d) => d && (d.kind === 'audioinput' || d.kind === 'audiooutput')).map(describeAudioDevice);
  const out = { inputs: [], outputs: [], defaultInput: null, defaultOutput: null, labelled: false };
  const seen = new Set();
  for (const d of all) {
    if (d.label) out.labelled = true;
    if (d.isDefault) continue;
    const key = `${d.kind}|${d.id || d.label}`;
    if (!d.id && !d.label) continue; // before permission: nothing to tell apart
    if (seen.has(key)) continue;
    seen.add(key);
    (d.kind === 'audiooutput' ? out.outputs : out.inputs).push(d);
  }
  const standsFor = (entry, list) => {
    if (!entry) return list[0] || null;
    const key = audioLabelKey(entry.label);
    return (key && list.find((x) => audioLabelKey(x.label) === key)) || (entry.groupId && list.find((x) => x.groupId === entry.groupId)) || { ...entry, isDefault: false };
  };
  const defIn = all.find((d) => d.isDefault && d.kind === 'audioinput' && d.id !== 'communications') || null;
  const defOut = all.find((d) => d.isDefault && d.kind === 'audiooutput' && d.id !== 'communications') || null;
  out.defaultInput = out.inputs.length || defIn ? standsFor(defIn, out.inputs) : null;
  out.defaultOutput = out.outputs.length || defOut ? standsFor(defOut, out.outputs) : null;
  if (out.defaultInput && !out.defaultInput.label) out.defaultInput = null;
  if (out.defaultOutput && !out.defaultOutput.label) out.defaultOutput = null;
  return out;
}

/** The Mac's own microphone (the built-in input), or null. */
export function builtinInput(devices) {
  return ((devices && devices.inputs) || []).find((d) => d.transport === 'builtin') || null;
}

/**
 * The remembered device ({ id, label } | null) in `list`: by device id, else by label (ids change when the
 * owner clears site data). { device, by: 'id' | 'label' } when found; { device: null, by: 'default' } when
 * nothing is remembered (Chrome's own choice, as before); missing: true when one is remembered but not listed.
 */
export function pickDevice(list, remembered) {
  const items = Array.isArray(list) ? list : [];
  const r = remembered && typeof remembered === 'object' ? remembered : null;
  if (!r || (!r.id && !r.label)) return { device: null, by: 'default', missing: false };
  if (r.id) {
    const byId = items.find((d) => d.id && d.id === r.id);
    if (byId) return { device: byId, by: 'id', missing: false };
  }
  if (r.label) {
    const key = audioLabelKey(r.label);
    const byLabel = key && items.find((d) => d.label && audioLabelKey(d.label) === key);
    if (byLabel) return { device: byLabel, by: 'label', missing: false };
  }
  return { device: null, by: 'default', missing: true };
}

/** A remembered choice from settings: { id, label } or null. */
export function remembered(id, label) {
  const i = typeof id === 'string' ? id : '';
  const l = typeof label === 'string' ? label : '';
  return i || l ? { id: i, label: l } : null;
}

/** The chosen devices in settings: { input, output } ({ id, label } | null each). */
export function chosenDevices(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return { input: remembered(s.audioInputId, s.audioInputLabel), output: remembered(s.audioOutputId, s.audioOutputLabel) };
}

/** The setup in settings ('' = none chosen). */
export function setupOf(settings) {
  const v = settings && typeof settings === 'object' ? settings.audioSetup : '';
  return SETUP_IDS.includes(v) ? v : '';
}

/**
 * The speakerphone for a setup the owner just picked: the speaker already chosen when it isn't the Mac's
 * own, else the default output when it isn't built in, else a Bluetooth output (one with a microphone of
 * its own first), else any output that isn't built in. Its microphone: the input of the same group, else
 * of the same name. Returns the devices to store: { input, output } (each described, or null = default).
 */
export function setupDevices(setup, devices, chosen = {}) {
  const list = devices && typeof devices === 'object' ? devices : { inputs: [], outputs: [] };
  const inputs = list.inputs || [];
  const outputs = list.outputs || [];
  const c = chosen && typeof chosen === 'object' ? chosen : {};
  const external = (d) => !!d && d.transport !== 'builtin';
  const hasMic = (o) => inputs.some((i) => sameDevice(i, o));
  const current = pickDevice(outputs, c.output).device;
  const def = list.defaultOutput && outputs.find((o) => o.id === list.defaultOutput.id);
  const bt = outputs.filter((o) => isBluetooth(o.transport));
  const speaker = (external(current) && current) || (external(def) && def) || bt.find(hasMic) || bt[0] || outputs.find((o) => external(o) && o.transport !== 'virtual' && hasMic(o)) || null;
  const speakerMic = speaker ? inputs.find((i) => sameDevice(i, speaker)) || null : null;
  const currentMic = pickDevice(inputs, c.input).device;
  const otherMic = speakerMic || (external(currentMic) && currentMic) || inputs.find((i) => isBluetooth(i.transport)) || null;
  const macMic = builtinInput(list);
  if (setup === 'speaker-mac-mic') return { input: macMic, output: speaker };
  if (setup === 'speakerphone-both' || setup === 'switch') return { input: otherMic, output: speaker };
  return { input: currentMic, output: current };
}

/** One physical device's microphone and speaker: the same group, else the same name. */
function sameDevice(a, b) {
  if (!a || !b) return false;
  if (a.groupId && b.groupId && a.groupId === b.groupId) return true;
  return !!a.name && a.name === b.name && a.transport === b.transport && !!a.transport && a.transport !== 'builtin';
}

const RAW = Object.freeze({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
const MAC_MIC = Object.freeze({ echoCancellation: true, noiseSuppression: false, autoGainControl: false }); // claps need NS and AGC off
const PROCESSED = Object.freeze({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });

/**
 * Which device does what, for the setup in settings and the devices listed now.
 *   setup   'speaker-mac-mic' | 'speakerphone-both' | 'switch' | '' (none: the devices picked by hand, if any)
 *   devices listAudioDevices(); chosen: { input, output } remembered; gone: { input, output } the watcher's
 *           confirmed absences (a chosen device missing from ONE enumeration is still used: see audioHotplugPlan)
 * Returns:
 *   wakeMic      the microphone Standby's capture opens (claps, "Hey Jarvis"): a device, or null for Chrome's
 *                own choice (as before)
 *   questionMic  the microphone questions are heard on (the recognizer's track, the home base's capture)
 *   speaker      where everything Jarvis plays goes (George, the chimes, music previews), or null (the default)
 *   wakeProcessing / questionProcessing   echo cancellation, noise suppression and auto gain for each
 *   missing      { input, output }: a chosen device that isn't there (Jarvis uses the default meanwhile)
 *   custom       devices picked by hand without a setup; none: nothing chosen at all (today's behaviour)
 *   bluetoothMic the question microphone is Bluetooth (its closing makes George wait SETTLE_MS)
 */
export function planSetup(setup, devices, chosen = {}, gone = {}) {
  const list = devices && typeof devices === 'object' ? devices : { inputs: [], outputs: [] };
  const c = chosen && typeof chosen === 'object' ? chosen : {};
  const g = gone && typeof gone === 'object' ? gone : {};
  const id = SETUP_IDS.includes(setup) ? setup : '';
  const resolve = (role, items) => {
    const want = c[role];
    if (!want || (!want.id && !want.label)) return { device: null, missing: false };
    if (g[role]) return { device: null, missing: true };
    const p = pickDevice(items, want);
    if (p.device) return { device: p.device, missing: false };
    // Not listed now, but not confirmed gone either (one missed enumeration): keep using it.
    return { device: { id: want.id || '', groupId: '', kind: role === 'output' ? 'audiooutput' : 'audioinput', label: want.label || '', ...describeLabel(want.label, role) }, missing: false };
  };
  const input = resolve('input', list.inputs || []);
  const output = resolve('output', list.outputs || []);
  const none = !id && !c.input && !c.output;
  const questionMic = input.device;
  let wakeMic = questionMic;
  let wakeProcessing = RAW; // Standby's detectors were made for raw sound (capture.js)
  if (id === 'speaker-mac-mic' || id === 'switch') {
    // The Mac's microphone waits for "Hey Jarvis": echo cancellation on (George plays through the
    // speakerphone), noise suppression and auto gain off (claps need them off).
    if (id === 'switch') wakeMic = builtinInput(list);
    wakeProcessing = MAC_MIC;
  }
  return {
    setup: id,
    none,
    custom: !id && !none,
    wakeMic,
    questionMic,
    speaker: output.device,
    wakeProcessing,
    questionProcessing: PROCESSED,
    missing: { input: input.missing, output: output.missing },
    bluetoothMic: !!questionMic && isBluetooth(questionMic.transport),
    bluetoothSpeaker: !!output.device && isBluetooth(output.device.transport),
  };
}

function describeLabel(label, role) {
  const d = describeAudioDevice({ kind: role === 'output' ? 'audiooutput' : 'audioinput', label: label || '' });
  return { name: d.name, transport: d.transport, connection: d.connection, isDefault: false };
}

/**
 * getUserMedia's audio constraints: the planned device (deviceId exact; null = Chrome's own choice) with
 * its processing. Mono is enough for every listener Jarvis has.
 */
export function audioConstraints(device, processing = RAW) {
  const p = processing && typeof processing === 'object' ? processing : RAW;
  const out = { echoCancellation: !!p.echoCancellation, noiseSuppression: !!p.noiseSuppression, autoGainControl: !!p.autoGainControl, channelCount: { ideal: 1 } };
  if (device && device.id && device.id !== 'default') out.deviceId = { exact: device.id };
  return out;
}

// ---- coming and going (the two-enumeration rule) ---------------------------------------------------------

/** Nothing known yet: the first enumeration decides at once (there is no mode switch to wait out). */
export function initialHotplugState() {
  return { input: 'unknown', output: 'unknown', inputSince: 0, outputSince: 0, inputKey: '', outputKey: '' };
}

/**
 * One enumeration, under the two-enumeration rule: a Bluetooth mode switch can fire devicechange while the
 * device stays (critique M7b), so a chosen device counts as gone only when two enumerations at least
 * `goneMs` apart both miss it (allowing timers a little slack). A device seen again is back at once.
 *   state    the last result's state (initialHotplugState() at first); per role: 'unknown' | 'present' |
 *            'suspect' (missed once, at `<role>Since`) | 'gone' | 'none' (nothing chosen)
 *   devices  listAudioDevices() of this enumeration; chosen: { input, output } ({ id, label } | null)
 * Returns { state, actions: [{ role: 'input' | 'output', action: 'fallback' | 'back', device }], recheckAt }:
 *   'fallback'  the chosen device is gone: use the default (Standby moves at once; the speaker goes to '')
 *   'back'      it is back: use it again
 *   recheckAt   when to enumerate again to confirm a suspect (0: nothing to confirm)
 */
export function audioHotplugPlan({ state, devices, chosen = {}, now = 0, goneMs = AUDIO_GONE_MS } = {}) {
  const prev = state && typeof state === 'object' ? state : initialHotplugState();
  const list = devices && typeof devices === 'object' ? devices : { inputs: [], outputs: [] };
  const c = chosen && typeof chosen === 'object' ? chosen : {};
  const next = { ...initialHotplugState(), ...prev };
  const actions = [];
  let recheckAt = 0;
  for (const role of ['input', 'output']) {
    const want = c[role];
    const sinceKey = `${role}Since`;
    const keyKey = `${role}Key`;
    if (!want || (!want.id && !want.label)) {
      next[role] = 'none';
      next[sinceKey] = 0;
      next[keyKey] = '';
      continue;
    }
    // Another device chosen since: what was known was about the old one.
    const key = `${want.id || ''}|${want.label || ''}`;
    next[keyKey] = key;
    const was = prev[role] === 'none' || prev[keyKey] !== key ? 'unknown' : prev[role] || 'unknown';
    const found = pickDevice(role === 'output' ? list.outputs : list.inputs, want).device;
    if (found) {
      next[role] = 'present';
      next[sinceKey] = 0;
      if (was === 'gone') actions.push({ role, action: 'back', device: found });
      continue;
    }
    if (was === 'unknown') {
      next[role] = 'gone';
      next[sinceKey] = now;
      actions.push({ role, action: 'fallback', device: null });
    } else if (was === 'present') {
      next[role] = 'suspect';
      next[sinceKey] = now;
      recheckAt = recheckAt ? Math.min(recheckAt, now + goneMs) : now + goneMs;
    } else if (was === 'suspect') {
      const since = Number(prev[sinceKey]) || now;
      if (now - since >= goneMs * 0.8) {
        next[role] = 'gone';
        next[sinceKey] = now;
        actions.push({ role, action: 'fallback', device: null });
      } else {
        next[role] = 'suspect';
        next[sinceKey] = since;
        recheckAt = recheckAt ? Math.min(recheckAt, since + goneMs) : since + goneMs;
      }
    } else {
      next[role] = 'gone';
    }
  }
  return { state: next, actions, recheckAt };
}

/**
 * The watcher's confirmed absences, for planSetup: { input, output }. With `chosen`, only absences of the
 * devices chosen now count (a state about a device chosen before says nothing about the new one).
 */
export function goneOf(state, chosen = null) {
  const s = state && typeof state === 'object' ? state : {};
  const same = (role) => {
    if (!chosen) return true;
    const want = chosen[role];
    return !!want && s[`${role}Key`] === `${want.id || ''}|${want.label || ''}`;
  };
  return { input: s.input === 'gone' && same('input'), output: s.output === 'gone' && same('output') };
}

// ---- Standby's capture retries and the Mac's sleep ----------------------------------------------------------

/** Standby's capture retries (today: one, after 1.5 s): 2 s, 5 s, 15 s, 60 s, then every 5 minutes. */
export const CAPTURE_RETRY_MS = Object.freeze([2000, 5000, 15000, 60000]);
export const CAPTURE_RETRY_EVERY_MS = 5 * 60000;

/** The wait before retry number `attempt` (0 = the first retry). */
export function captureRetryDelay(attempt) {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return n < CAPTURE_RETRY_MS.length ? CAPTURE_RETRY_MS[n] : CAPTURE_RETRY_EVERY_MS;
}

/**
 * Retries with back-off (captureRetryDelay), on the page's timers (a virtual clock in tests):
 *   const b = createBackoff(retry);
 *   b.failed()     -> the wait (ms) before retry() runs; each failure in a row waits longer
 *   b.succeeded()  the next failure starts from 2 s again; b.cancel(): no retry pending
 *   b.pending, b.attempt
 */
export function createBackoff(retry, { delay = captureRetryDelay } = {}) {
  let attempt = 0;
  let timer = 0;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
  };
  return {
    failed() {
      cancel();
      const ms = delay(attempt);
      attempt += 1;
      timer = setTimeout(() => {
        timer = 0;
        retry();
      }, ms);
      return ms;
    },
    succeeded() {
      cancel();
      attempt = 0;
    },
    cancel,
    get pending() {
      return !!timer;
    },
    get attempt() {
      return attempt;
    },
  };
}

/** Why a failed capture is retried: not a refusal (the owner must allow it) and not a missing feature. */
export function captureRetryable(reason) {
  return reason === 'busy' || reason === 'no-mic' || reason === 'error' || reason === 'ended';
}

/** How often the sleep check runs, and how much later than that counts as a sleep (hidden pages' timers
 * may run once a minute: that is not a sleep). */
export const SLEEP_CHECK_MS = 15000;
export const SLEEP_SLACK_MS = 2 * 60000;

/** True when Date.now() jumped well past the next check: the Mac slept (or the clock was set forward). */
export function clockJumped(lastAt, now, everyMs = SLEEP_CHECK_MS, slackMs = SLEEP_SLACK_MS) {
  const a = Number(lastAt);
  const b = Number(now);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return false;
  return b - a > everyMs + slackMs;
}

// ---- what Standby and Jarvis say ------------------------------------------------------------------------

/** The Standby pill's name for the microphone it listens on: "THE MAC’S MICROPHONE", the device's name. */
export function micPillName(device) {
  if (!device) return 'THIS DEVICE';
  if (device.transport === 'builtin') return 'THE MAC’S MICROPHONE';
  return cleanText(device.name || '', 32).toUpperCase() || 'THIS DEVICE';
}

/** The pill's name for a chosen microphone that went away: "SPEAKERPHONE" for a Bluetooth one. */
export function goneName(device) {
  if (!device || isBluetooth(device.transport) || !device.name) return 'SPEAKERPHONE';
  return cleanText(device.name, 32).toUpperCase();
}

/**
 * The one short line before the greeting at the next wake when a chosen device isn't connected ('' when
 * all is well). Said only at a wake the owner made: never out loud at night by itself.
 */
export function awayLine(plan, devices) {
  if (!plan || !plan.missing) return '';
  const list = devices && typeof devices === 'object' ? devices : {};
  if (plan.missing.output) {
    const out = list.defaultOutput;
    const where = !out || out.transport === 'builtin' ? 'the Mac’s speakers' : out.name;
    return `I’m on ${where}; the speakerphone isn’t connected.`;
  }
  if (plan.missing.input) {
    const mic = list.defaultInput;
    const where = !mic || mic.transport === 'builtin' ? 'the Mac’s microphone' : mic.name;
    return `I’m listening on ${where}; the speakerphone isn’t connected.`;
  }
  return '';
}

// ---- the recognizer and a track --------------------------------------------------------------------------

/**
 * True when this browser's speech recognizer hears a track it is given (recognition.start(track)): Chrome
 * and Edge 135+ on a computer, Firefox 160+. Older Chrome ignores the track WITHOUT an error and opens its
 * own preferred microphone, so this is decided from the browser's version, not from a failure.
 *   env: { brands: navigator.userAgentData.brands, mobile: navigator.userAgentData.mobile, userAgent }
 */
export function trackStartSupport(env = {}) {
  const e = env && typeof env === 'object' ? env : {};
  const ua = typeof e.userAgent === 'string' ? e.userAgent : '';
  if (e.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
  const brands = Array.isArray(e.brands) ? e.brands : [];
  const chromium = brands.find((b) => b && /^(Chromium|Google Chrome|Microsoft Edge)$/.test(String(b.brand)));
  if (chromium) return Number.parseInt(chromium.version, 10) >= 135;
  if (/\bEdg\/|\bOPR\//.test(ua) || /\bChrome\/\d+/.test(ua)) {
    const m = /\bChrome\/(\d+)/.exec(ua);
    return !!m && Number(m[1]) >= 135;
  }
  const ff = /\bFirefox\/(\d+)/.exec(ua);
  if (ff) return Number(ff[1]) >= 160;
  return false;
}

// ---- the hands-free Test --------------------------------------------------------------------------------

/** Where the hands-free Test keeps its last results on this device (Voice Mode's barge-in reads it). */
export const HANDS_FREE_TEST_KEY = 'jarvis.handsFreeTest.v1';

/**
 * The stored result, checked: { at, hiddenWords: true|false|null, selfTrigger: 'passed'|'failed'|null,
 * heardSpeaker: true|false|null }, or null when there is none (or it is not one).
 */
export function normalizeHandsFreeTest(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const at = Number(v.at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const tri = (x) => (x === true || x === false ? x : null);
  return {
    at,
    hiddenWords: tri(v.hiddenWords),
    selfTrigger: v.selfTrigger === 'passed' || v.selfTrigger === 'failed' ? v.selfTrigger : null,
    heardSpeaker: tri(v.heardSpeaker),
  };
}

/** The Test's three steps as the card shows them: [{ step, ok: true | false | null, text }]. */
export function handsFreeLines(result) {
  const r = normalizeHandsFreeTest(result);
  if (!r) return [];
  return [
    {
      step: 'hidden',
      ok: r.hiddenWords,
      text: r.hiddenWords === true ? 'Heard you while Jarvis was in the background.' : r.hiddenWords === false ? 'Nothing was heard while Jarvis was in the background.' : 'Not checked: Jarvis stayed on screen.',
    },
    {
      step: 'self',
      ok: r.selfTrigger === 'passed' ? true : r.selfTrigger === 'failed' ? false : null,
      text:
        r.selfTrigger === 'passed'
          ? 'George saying “Jarvis” didn’t wake Jarvis: “Hey Jarvis” can interrupt him.'
          : r.selfTrigger === 'failed'
            ? 'George’s own voice woke Jarvis, so interrupting him by voice stays off.'
            : 'Not checked: George or the wake microphone wasn’t ready.',
    },
    {
      step: 'speaker',
      ok: r.heardSpeaker,
      text: r.heardSpeaker === true ? 'George came from the speakerphone.' : r.heardSpeaker === false ? 'George didn’t come from the speakerphone.' : 'Not answered.',
    },
  ];
}

// ---- A10 (SHOULD): the "Always on" card ------------------------------------------------------------------------

/** What a page can't check: said, not checked (the README's "Always on: the Mac checklist"). */
export const ALWAYS_ON_TOLD = Object.freeze([
  'System Settings → Battery → Options → “Prevent automatic sleeping on power adapter when the display is off”: on (the display may sleep; the Mac must not).',
  'The MacBook’s lid open: its microphone is off while the lid is closed.',
  'Chrome’s Settings → Performance → “Always keep these sites active”: the Jarvis site.',
  'Chrome up to date, and no Focus mode silencing Jarvis’s notifications.',
]);

/**
 * The "Always on" card's checks, from what the page can see: [{ check, ok: true | false | null, text }].
 * env: { mic ('granted' | 'denied' | 'prompt' | 'unknown'), plan, devices, power (true | false | null), installed,
 * notifications ('granted' | 'denied' | 'default' | 'unsupported'), settings, george ({ ready, label } | null),
 * trackUse ({ used } | null), takesTrack (bool), test (the hands-free Test's stored result) }. Pure.
 */
export function alwaysOnChecks(env = {}) {
  const e = env && typeof env === 'object' ? env : {};
  const out = [];
  const add = (check, ok, text) => out.push({ check, ok, text });
  const p = e.plan || { none: true, missing: {} };
  const s = e.settings || {};
  add('mic', e.mic === 'granted', e.mic === 'granted' ? 'The microphone is allowed for Jarvis.' : e.mic === 'denied' ? 'The microphone is blocked: allow it in Chrome’s site settings, and choose “Allow on every visit”.' : 'Allow the microphone, and choose “Allow on every visit” (not “Allow this time”: it ends after 16 hours).');
  if (p.none) add('device', null, 'No microphone or speaker chosen: Jarvis follows the Mac’s sound settings.');
  else if (p.missing && (p.missing.input || p.missing.output)) add('device', false, 'The chosen speakerphone isn’t connected: Jarvis uses the Mac’s microphone and speakers until it’s back.');
  else add('device', true, `Listening on ${p.questionMic ? p.questionMic.name : 'the default microphone'}; speaking on ${p.speaker ? p.speaker.name : 'the default speaker'}.`);
  if (p.setup === 'speakerphone-both' || (p.custom && p.bluetoothMic)) add('bluetooth', false, 'The speakerphone’s Bluetooth microphone listens: George sounds like a phone call while Standby listens. “Speakerphone speaks, Mac listens” keeps his full sound.');
  else if (p.bluetoothSpeaker) add('bluetooth', true, 'The speakerphone only speaks: George keeps his full sound.');
  add('power', e.power === true ? true : e.power === false ? false : null, e.power === true ? 'On power.' : e.power === false ? 'On battery: plug the Mac in.' : 'Keep the Mac on power (this browser doesn’t say).');
  add('installed', !!e.installed, e.installed ? 'Installed as an app: George can speak after a restart without a click.' : 'Install Jarvis as an app (the install icon in Chrome’s address bar): then George can speak after a restart without a click.');
  add('notifications', e.notifications === 'granted', e.notifications === 'granted' ? 'Notifications are on.' : 'Turn on notifications (Settings → Appearance & sound), so a wake in the background can tell you he’s listening.');
  const clap = s.wakeClap !== false;
  const word = s.wakeWord === true;
  add('wake', clap || word, clap && word ? 'Two claps and “Hey Jarvis” wake him.' : clap ? 'Two claps wake him (“Hey Jarvis” is off: Wake Jarvis).' : word ? '“Hey Jarvis” wakes him (claps are off).' : 'Nothing wakes him: turn on Clap twice or Say “Hey Jarvis” in Wake Jarvis.');
  const g = e.george || null;
  add('george', g ? !!g.ready : null, g && g.ready ? `${g.label || 'George'} is ready.` : 'George isn’t ready: the Mac’s own voice speaks meanwhile (Jarvis’s voice, above).');
  if (!p.none && p.questionMic) {
    if (!e.takesTrack) add('recognizer', false, `This Chrome can’t hand its recognizer a microphone: set Chrome’s microphone to ${p.questionMic.name}.`);
    else if (e.trackUse) add('recognizer', !!e.trackUse.used, e.trackUse.used ? `Your last question was heard on ${p.questionMic.name}.` : `Your last question was heard on Chrome’s own microphone: set it to ${p.questionMic.name}.`);
    else add('recognizer', null, `Your questions will be heard on ${p.questionMic.name} (not checked yet: after your next question).`);
  }
  for (const l of handsFreeLines(e.test)) add(`test-${l.step}`, l.ok, `Hands-free Test: ${l.text}`);
  if (!normalizeHandsFreeTest(e.test)) add('test', null, 'Hands-free Test: not run yet (Microphone and speaker → Test hands-free).');
  return out;
}

// ---- "Which microphone are you using?" -----------------------------------------------------------------------

/**
 * What Jarvis says when asked where he listens and speaks (src/ui/commands/audio.js): from the plan of the
 * moment and the devices listed. Plain, one sentence; never names more than it knows.
 */
export function audioStatusLine(plan, devices) {
  const p = plan && typeof plan === 'object' ? plan : null;
  const list = devices && typeof devices === 'object' ? devices : {};
  const micName = (d) => (!d ? '' : d.transport === 'builtin' ? 'the Mac’s microphone' : d.name);
  const speakerName = (d) => (!d ? '' : d.transport === 'builtin' ? 'the Mac’s speakers' : d.name);
  if (!p || p.none) {
    const mic = micName(list.defaultInput);
    const out = speakerName(list.defaultOutput);
    if (mic && out) return `I’m following the Mac’s sound settings: listening on ${mic} and speaking on ${out}.`;
    return 'I’m using this device’s own microphone and speaker.';
  }
  if (p.missing && (p.missing.input || p.missing.output)) {
    const which = p.missing.input && p.missing.output ? 'microphone and speakers' : p.missing.input ? 'microphone' : 'speakers';
    return `The speakerphone isn’t connected: I’m on the Mac’s ${which} until it’s back.`;
  }
  const mic = micName(p.questionMic) || micName(list.defaultInput) || 'the default microphone';
  const out = speakerName(p.speaker) || speakerName(list.defaultOutput) || 'the default speaker';
  const wake = p.setup === 'switch' && p.wakeMic && p.wakeMic !== p.questionMic ? ` “Hey Jarvis” and claps are heard on ${micName(p.wakeMic)}.` : '';
  return mic === out ? `I’m listening and speaking on ${mic}.${wake}` : `I’m listening on ${mic} and speaking on ${out}.${wake}`;
}
