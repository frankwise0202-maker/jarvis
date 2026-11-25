// Which voice Jarvis speaks with, in words the owner sees (v7.8, SPEC §26). Pure: no DOM, no network.
//
//   autoSpeakDecision({ settings, view, problem, demo })   turn "George's voice from the home base" on by
//                                                          itself? { act, why }
//   voiceLabel(engine, { voiceName, os })                  "George · home base" | "George · this device" |
//                                                          "iPhone voice" | "built-in voice"
//   deviceVoiceWord(os)                                    "iPhone voice" | "iPad voice" | "built-in voice"
//   voiceInUse({ settings, senses, natural, device, os, voiceName })
//                                                          the voice the next reply uses, where it comes
//                                                          from, and what is getting ready meanwhile
//
// The owner never heard a difference through the voice updates: every better voice (George on the home
// base, George on this device) was off until he found the switch. v7.8 turns George from the home base on
// once by itself, when a home base with a voice (Jarvis Core 1.2 or later) is linked and answers, and
// only if nobody has switched it on this device before (settings.homeBaseSpeakBy ''). Once the owner
// switches it himself, on or off, the app never does it again ('owner').

import { deviceLabel } from './brain.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Whether the app turns "George's voice from the home base" on by itself now.
 *   settings  homeBaseUrl, homeBaseSpeak, homeBaseSpeakBy
 *   view      the home base's GET api/senses (src/lib/senses.js sensesView) or null
 *   problem   the last reading's problem ({ state: 'old' | 'offline' | … }) or null
 * Returns { act: boolean, why } — why: 'demo' | 'unlinked' | 'on' | 'owner' | 'done' | 'unknown' |
 * 'old' | 'unreachable' | 'nodeps' | 'error' | 'ok'.
 */
export function autoSpeakDecision({ settings, view = null, problem = null, demo = false } = {}) {
  const s = isObj(settings) ? settings : {};
  if (demo) return { act: false, why: 'demo' };
  if (typeof s.homeBaseUrl !== 'string' || !s.homeBaseUrl) return { act: false, why: 'unlinked' };
  if (s.homeBaseSpeak === true) return { act: false, why: 'on' };
  if (s.homeBaseSpeakBy === 'owner') return { act: false, why: 'owner' }; // he chose: never again
  if (s.homeBaseSpeakBy === 'auto') return { act: false, why: 'done' }; // once only
  if (!isObj(view)) {
    const st = isObj(problem) ? problem.state : '';
    if (st === 'old') return { act: false, why: 'old' }; // a Core without senses (1.1): it needs an update
    if (st) return { act: false, why: 'unreachable' }; // not now; the next launch or return tries again
    return { act: false, why: 'unknown' };
  }
  if (isObj(view.deps) && view.deps.installed === false) return { act: false, why: 'nodeps' };
  const speak = isObj(view.speak) ? view.speak : null;
  if (!speak) return { act: false, why: 'unknown' };
  if (speak.state === 'error' && speak.enabled) return { act: false, why: 'error' };
  return { act: true, why: 'ok' };
}

/** The device's own voice, by device: "iPhone voice", "iPad voice", else "built-in voice". */
export function deviceVoiceWord(os) {
  if (os === 'ios') return 'iPhone voice';
  if (os === 'ipados') return 'iPad voice';
  return 'built-in voice';
}

/** The small label for the voice speaking now. engine: 'homebase' | 'natural' | 'device'. */
export function voiceLabel(engine, { voiceName = 'George', os = 'other' } = {}) {
  const name = typeof voiceName === 'string' && voiceName.trim() ? voiceName.trim() : 'George';
  if (engine === 'homebase') return `${name} · home base`;
  if (engine === 'natural') return `${name} · this device`;
  if (engine === 'device') return deviceVoiceWord(os);
  return '';
}

/** "this iPhone" / "this Mac" / "this device". */
export function thisDevice(os) {
  const label = deviceLabel(os);
  return label === 'Browser' || label === 'Windows PC' || label === 'Android phone' ? 'this device' : `this ${label}`;
}

const pct = (p) => `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`;

/**
 * What the home base's voice is doing for this device, when it is on here but can't speak yet:
 * { state, text } or null (off here, or ready).
 *   senses  { phase, view, problem, cooling } (src/ui/senses.js getState() and cooling('speak'))
 */
export function homeVoicePending({ settings, senses, voiceName = 'George' } = {}) {
  const s = isObj(settings) ? settings : {};
  if (s.homeBaseSpeak !== true || typeof s.homeBaseUrl !== 'string' || !s.homeBaseUrl) return null;
  const sn = isObj(senses) ? senses : {};
  const view = isObj(sn.view) ? sn.view : null;
  const name = voiceName;
  if (!view) {
    const p = isObj(sn.problem) ? sn.problem : null;
    if (p && p.state === 'old') return { state: 'old', text: 'Your home base needs an update for George’s voice: run jarvis-core update on the Alienware.' };
    if (p) return { state: 'unreachable', text: `The home base can’t be reached right now, so ${name} from the home base waits.` };
    return { state: 'checking', text: 'Checking the home base…' };
  }
  if (view.deps && view.deps.installed === false) return { state: 'nodeps', text: 'The home base is missing its speech software: run jarvis-core update on the Alienware.' };
  const p = isObj(view.speak) ? view.speak : {};
  if (!p.enabled) return { state: 'off-there', text: `${name}’s voice is off at the home base (turned off there or on another device).` };
  if (p.state === 'error') return { state: 'error', text: `The home base couldn’t get ${name}’s voice ready${p.error ? `: ${p.error}` : '.'}` };
  if (p.state === 'downloading') return { state: 'downloading', progress: p.progress, text: `${name} is getting ready on your Alienware (downloading${typeof p.progress === 'number' ? ` ${pct(p.progress)}` : ''}${p.sizeMb ? ` of about ${p.sizeMb} MB` : ''}, once).` };
  if (p.state !== 'ready') return { state: 'loading', text: `${name} is getting ready on your Alienware…` };
  if (sn.cooling) return { state: 'resting', text: 'The home base didn’t answer in time just now, so this device speaks for a minute.' };
  return null;
}

/**
 * The voice the next reply uses (the same choice as the voice router, platform/voice/voice-router.js),
 * where it comes from, and what is getting ready meanwhile.
 *   settings  homeBaseUrl, homeBaseSpeak, naturalVoice
 *   senses    { phase, view, problem, cooling, canSpeak } (null: no home base in this app)
 *   natural   { supported, state, knownSlow } (the on-device engine; null: none)
 *   device    { name } the device voice Jarvis picked (or the owner chose), if known
 * Returns { engine, label, where, pending } (pending: homeVoicePending's, or null).
 */
export function voiceInUse({ settings, senses = null, natural = null, device = null, os = 'other', voiceName = 'George' } = {}) {
  const s = isObj(settings) ? settings : {};
  const dev = thisDevice(os);
  const sn = isObj(senses) ? senses : null;
  const pending = sn ? homeVoicePending({ settings: s, senses: sn, voiceName }) : null;
  let engine = 'device';
  if (sn && s.homeBaseSpeak === true && sn.canSpeak === true) engine = 'homebase';
  else if (isObj(natural) && natural.supported && s.naturalVoice === true) {
    const st = natural.state;
    if (st === 'ready') engine = 'natural';
    else if (natural.knownSlow || st === 'slow' || st === 'error' || st === 'downloading') engine = 'device';
    else engine = 'natural'; // off, starting, loading, warming: it starts (or loads) when Jarvis next speaks
  }
  const label = voiceLabel(engine, { voiceName, os });
  let where;
  if (engine === 'homebase') where = `${voiceName}’s natural voice, made by your Alienware and played on ${dev}. Free: it runs on your own computer at home.`;
  else if (engine === 'natural') where = `${voiceName}’s natural voice, made on ${dev} itself (free). It can be slow on iPhone.`;
  else {
    const n = isObj(device) && typeof device.name === 'string' && device.name.trim() ? device.name.trim() : '';
    where = `${dev.replace(/^this /, 'This ')}’s own voice${n ? ` (${n})` : ''}.`;
  }
  return { engine, label, where, pending };
}
