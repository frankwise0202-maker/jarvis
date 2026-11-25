// Settings → Home base → "Hearing and voice (beta)" (v7.7, SPEC §25): Whisper and George's voice made
// by Jarvis Core on the owner's Alienware instead of on this device. Free: it runs on the owner's own
// computer and nothing goes to any cloud.
//   · "Hear me through the home base (more accurate)": on/off, Fast or Accurate, its download and
//     state on the home base, and Test (records 3 seconds and shows what the home base heard).
//   · "George's voice from the home base": on/off, its download and state, and Test (one sentence).
// Each switch is this device's (settings homeBaseHear / homeBaseSpeak) and turns that part on at the
// home base too (PUT api/senses: on starts the download and the warm-up there). Off: hearing is turned
// off at the home base too; George's voice only on this device (v7.8: every device shares the home
// base's George, so the others keep him; a device whose switch is on turns him on there again).
// Shown only while a home base is linked; a Core without senses says it needs an update.
//
//   const card = createSensesSettings(senses, { audio, createCapture, getSettings, commit, toast, os, stopSpeaking,
//                                               unlockVoice, onSilent });
//   card.el · card.destroy()
//   unlockVoice()   v7.8.1: the voice router's unlockSpeech(), inside the Test tap (a stuck output gets started
//                   afresh there); onSilent(audio): the Test's sample didn't move the audio clock (nothing
//                   played): the router keeps replies on the device voice (tts.noteAudioStuck)
//
// Test ids: senses-settings, senses-state, senses-retry, senses-hear (card), senses-hear-toggle,
// senses-hear-model, senses-hear-status (data-state), senses-hear-progress, senses-hear-test,
// senses-hear-result, senses-speak (card), senses-speak-toggle, senses-speak-status, senses-speak-progress,
// senses-speak-test, senses-speak-result. All text goes through dom.js (textContent only).

import { h, setText, watchAway } from './dom.js';
import { icon } from './icons.js';
import { deviceLabel } from '../lib/brain.js';
import { HEAR_MODELS, hearModelLabel, sensesProblem, encodeWav, HEAR_SAMPLE_RATE, NO_DEPS_MESSAGE } from '../lib/senses.js';
import { voiceById } from '../platform/voice/natural/catalog.js';
import { samplePlayed, silentSampleText, unsureSampleText } from '../lib/voice-choice.js';

const TEST_SECONDS = 3;
const TEST_HEAR_TIMEOUT_MS = 20000; // the first test may wait for the model to load on the home base
const TEST_SPEAK_TIMEOUT_MS = 20000;

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] hearing and voice settings:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

function out(el, text, tone = 'info') {
  el.hidden = !text;
  el.dataset.tone = tone;
  el.replaceChildren(...(text ? [icon(tone === 'ok' ? 'check' : tone === 'busy' ? 'spinner' : tone === 'info' ? 'info' : 'alert', { size: 16 }), h('span', { text })] : []));
}

function thisDevice(os) {
  const label = deviceLabel(os);
  return label === 'Browser' || label === 'Windows PC' || label === 'Android phone' ? 'this device' : `this ${label}`;
}

const pct = (p) => `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`;
const size = (mb) => (mb ? ` of about ${mb} MB` : '');

export function createSensesSettings(senses, { audio = null, createCapture = null, getSettings, commit, toast, os = 'other', stopSpeaking = () => {}, unlockVoice = null, onSilent = null } = {}) {
  const say = (text, opts) => safe(() => typeof toast === 'function' && toast(text, opts));
  const settings = () => safe(() => getSettings() || {}, {});
  const devWord = thisDevice(os);
  let destroyed = false;
  let busy = { hear: false, speak: false };
  let testing = { hear: null, speak: null };

  // ---- the state line ------------------------------------------------------------------------------
  const stateMsg = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'senses-state' } });
  const retry = h('button', { class: 'btn btn-sm', type: 'button', hidden: true, attrs: { 'data-testid': 'senses-retry' }, on: { click: () => senses.load({ force: true }) } }, icon('refresh', { size: 14 }), h('span', { text: 'Try again' }));

  // ---- hearing ---------------------------------------------------------------------------------------
  const hearSw = h('input', { class: 'switch', type: 'checkbox', id: 'set-homeBaseHear', checked: !!settings().homeBaseHear, attrs: { role: 'switch', 'data-testid': 'senses-hear-toggle', 'aria-describedby': 'set-homeBaseHear-help set-homeBaseHear-status' }, on: { change: () => toggleHear(hearSw.checked) } });
  const modelSel = h(
    'select',
    { class: 'select', id: 'set-homeBaseHearModel', attrs: { 'data-testid': 'senses-hear-model', 'aria-label': 'How the home base hears' }, on: { change: () => chooseModel(modelSel.value) } },
    HEAR_MODELS.map((m) => h('option', { value: m.id, text: m.label })),
  );
  const hearStatusText = h('span', { class: 'nv-status-text' });
  const hearProgress = h('progress', { class: 'nv-progress', max: 1, value: 0, hidden: true, attrs: { 'data-testid': 'senses-hear-progress', 'aria-label': 'Whisper download on the home base' } });
  const hearStatus = h('div', { class: 'nv-status', id: 'set-homeBaseHear-status', attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'senses-hear-status' } }, hearStatusText, hearProgress);
  const hearTestLabel = h('span', { text: 'Test' });
  const hearTest = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'senses-hear-test' }, on: { click: () => testHear() } }, icon('mic', { size: 16 }), hearTestLabel);
  const hearOut = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'senses-hear-result' } });
  const hearCard = h(
    'div',
    { class: 'set-card brain-card senses-card', attrs: { 'data-testid': 'senses-hear' } },
    h(
      'div',
      { class: 'brain-switch-row' },
      h(
        'div',
        { class: 'set-row-text' },
        h('label', { class: 'set-label', attrs: { for: 'set-homeBaseHear' }, text: 'Hear me through the home base (more accurate)' }),
        h('p', { class: 'set-help', id: 'set-homeBaseHear-help', text: `In Voice Mode, Whisper on your Alienware hears what you say instead of ${devWord}’s own recognizer (it shows “via home base”). If the home base can’t be reached or takes more than 4 seconds, ${devWord} listens as before.` }),
      ),
      h('div', { class: 'set-row-control' }, hearSw),
    ),
    h('div', { class: 'brain-row senses-model-row' }, h('label', { class: 'set-label senses-model-label', attrs: { for: 'set-homeBaseHearModel' }, text: 'How it hears' }), modelSel),
    h('p', { class: 'set-help senses-model-help', text: 'Fast: Whisper base, about a second for a sentence. Accurate: Whisper small, hears more, a little slower.' }),
    hearStatus,
    h('div', { class: 'set-row-actions set-row-actions--start' }, hearTest),
    hearOut,
  );

  // ---- voice -----------------------------------------------------------------------------------------
  const speakSw = h('input', { class: 'switch', type: 'checkbox', id: 'set-homeBaseSpeak', checked: !!settings().homeBaseSpeak, attrs: { role: 'switch', 'data-testid': 'senses-speak-toggle', 'aria-describedby': 'set-homeBaseSpeak-help set-homeBaseSpeak-status' }, on: { change: () => toggleSpeak(speakSw.checked) } });
  const speakStatusText = h('span', { class: 'nv-status-text' });
  const speakProgress = h('progress', { class: 'nv-progress', max: 1, value: 0, hidden: true, attrs: { 'data-testid': 'senses-speak-progress', 'aria-label': 'George’s voice download on the home base' } });
  const speakStatus = h('div', { class: 'nv-status', id: 'set-homeBaseSpeak-status', attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'senses-speak-status' } }, speakStatusText, speakProgress);
  const speakTestLabel = h('span', { text: 'Test' });
  const speakTest = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'senses-speak-test' }, on: { click: () => testSpeak() } }, icon('speaker', { size: 16 }), speakTestLabel);
  const speakOut = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'senses-speak-result' } });
  const voiceName = () => (voiceById(settings().naturalVoiceId) || voiceById('bm_george') || { name: 'George' }).name;
  const speakLabel = h('label', { class: 'set-label', attrs: { for: 'set-homeBaseSpeak' }, text: 'George’s voice from the home base' });
  const speakCard = h(
    'div',
    { class: 'set-card brain-card senses-card', attrs: { 'data-testid': 'senses-speak' } },
    h(
      'div',
      { class: 'brain-switch-row' },
      h('div', { class: 'set-row-text' }, speakLabel, h('p', { class: 'set-help', id: 'set-homeBaseSpeak-help', text: `Replies in the natural voice, made on your Alienware instead of ${devWord}, sentence by sentence. If the home base can’t be reached, Jarvis uses the natural voice on ${devWord} (when it’s on) or the built-in voice.` })),
      h('div', { class: 'set-row-control' }, speakSw),
    ),
    speakStatus,
    h('div', { class: 'set-row-actions set-row-actions--start' }, speakTest),
    speakOut,
  );

  const parts = h('div', { class: 'brain-parts' }, hearCard, speakCard);
  const el = h(
    'div',
    { class: 'brain-settings senses-settings', hidden: true, attrs: { 'data-testid': 'senses-settings' } },
    h('h4', { class: 'set-section-sub hud-label', text: 'Hearing and voice (beta)' }),
    h('p', { class: 'set-help senses-intro' }, icon('lock', { size: 14 }), h('span', { text: 'Free: Whisper and the natural voice run on your own computer at home. What you say goes only to your home base over Tailscale, never to any cloud.' })),
    h('div', { class: 'brain-state-row' }, stateMsg, retry),
    parts,
  );

  // ---- rendering --------------------------------------------------------------------------------------
  function partText(which, p, on, view) {
    const what = which === 'hear' ? `Whisper (${hearModelLabel(p.model)})` : `${voiceName()}’s voice`;
    const resting = safe(() => senses.cooling(which), false);
    if (view && view.deps && view.deps.installed === false) return { state: 'error', text: NO_DEPS_MESSAGE };
    if (p.state === 'error') return { state: 'error', text: `The home base couldn’t get ${what} ready${p.error ? `: ${p.error}` : '.'} Switch it off and on to try again.` };
    if (!p.enabled) {
      if (on && which === 'speak') return { state: 'warn', text: `Off at the home base (it was turned off there). Jarvis turns it on there again for ${devWord}; until it’s ready, ${devWord} uses its own voice.` };
      if (on) return { state: 'warn', text: `Off at the home base (it was turned off there or on another device). Switch it off and on to start it again. Until then ${devWord} uses its own recognizer.` };
      return { state: 'off', text: `Off. Turning it on downloads ${what}${p.sizeMb ? ` (about ${p.sizeMb} MB)` : ''} on the home base, once.` };
    }
    if (p.state === 'downloading') return { state: 'downloading', text: `Downloading ${what} on the home base…${p.progress !== null ? ` ${pct(p.progress)}` : ''}${size(p.sizeMb)}` };
    if (p.state === 'loading' || p.state === 'warming') return { state: 'loading', text: `Getting ${what} ready on the home base…` };
    if (p.state === 'off') return { state: 'loading', text: `Starting ${what} on the home base…` };
    // Ready.
    if (!on) return { state: 'ready-elsewhere', text: `Ready on the home base. Off on ${devWord}.` };
    if (resting) return { state: 'resting', text: `Ready, but the home base didn’t answer in time just now, so ${devWord} uses its own ${which === 'hear' ? 'recognizer' : 'voice'} for a minute.` };
    return which === 'hear' ? { state: 'ready', text: 'Ready. Voice Mode hears you through the home base.' } : { state: 'ready', text: `Ready. Replies use ${voiceName()}’s voice from the home base.` };
  }

  function renderPart(which, view) {
    const p = view[which];
    const on = which === 'hear' ? !!settings().homeBaseHear : !!settings().homeBaseSpeak;
    const sw = which === 'hear' ? hearSw : speakSw;
    const statusEl = which === 'hear' ? hearStatus : speakStatus;
    const textEl = which === 'hear' ? hearStatusText : speakStatusText;
    const bar = which === 'hear' ? hearProgress : speakProgress;
    if (!busy[which]) sw.checked = on;
    const t = partText(which, p, on, view);
    statusEl.dataset.state = t.state;
    setText(textEl, t.text);
    const showBar = p.enabled && p.state === 'downloading';
    bar.hidden = !showBar;
    if (showBar) bar.value = p.progress !== null ? p.progress : 0;
    const testBtn = which === 'hear' ? hearTest : speakTest;
    testBtn.disabled = !(p.enabled && p.state === 'ready') || !!testing[which] || (view.deps && view.deps.installed === false);
    if (which === 'hear' && !busy.hear) modelSel.value = HEAR_MODELS.some((m) => m.id === p.model) ? p.model : 'base.en';
  }

  function render() {
    if (destroyed) return;
    const st = senses.getState();
    el.hidden = st.phase === 'unset';
    if (st.phase === 'unset') return;
    setText(speakLabel, `${voiceName()}’s voice from the home base`);
    const view = st.senses;
    if (!view) {
      parts.hidden = true;
      if (st.phase === 'failed' && st.problem) {
        out(stateMsg, st.problem.message, st.problem.state === 'old' ? 'warn' : 'err');
        retry.hidden = st.problem.state === 'old';
      } else {
        out(stateMsg, 'Checking what the home base can hear and say…', 'busy');
        retry.hidden = true;
      }
      return;
    }
    parts.hidden = false;
    if (st.phase === 'failed' && st.problem) {
      out(stateMsg, st.problem.message, 'warn');
      retry.hidden = false;
    } else {
      out(stateMsg, '');
      retry.hidden = true;
    }
    renderPart('hear', view);
    renderPart('speak', view);
  }

  // ---- switches ---------------------------------------------------------------------------------------
  async function toggleHear(on) {
    if (busy.hear) return;
    busy.hear = true;
    hearSw.disabled = true;
    out(hearOut, on ? 'Turning it on at the home base…' : '', 'busy');
    if (!on) safe(() => commit({ homeBaseHear: false })); // off here at once, whatever the home base says
    const r = await senses.save({ hear: on ? { enabled: true, model: modelSel.value } : { enabled: false } });
    busy.hear = false;
    hearSw.disabled = false;
    if (destroyed) return;
    if (r && r.ok) {
      if (on) safe(() => commit({ homeBaseHear: true }));
      out(hearOut, on ? 'On. The home base gets Whisper ready; until it’s ready, Voice Mode listens as before.' : `Off. Voice Mode listens with ${devWord}’s own recognizer.`, 'ok');
    } else if (on) {
      hearSw.checked = false;
      out(hearOut, `Couldn’t turn it on: ${sensesProblem(r).message}`, 'err');
    } else out(hearOut, `Off on ${devWord}. (The home base didn’t answer, so it may still have Whisper on.)`, 'warn');
    render();
  }

  async function chooseModel(model) {
    if (busy.hear) return;
    const st = senses.getState();
    const enabled = !!(st.senses && st.senses.hear.enabled);
    busy.hear = true;
    out(hearOut, `Switching to ${hearModelLabel(model)}…`, 'busy');
    const r = await senses.save({ hear: { enabled, model } });
    busy.hear = false;
    if (destroyed) return;
    if (r && r.ok) out(hearOut, enabled ? `${hearModelLabel(model)}: the home base gets it ready (a download the first time).` : `${hearModelLabel(model)} it is, once you turn hearing on.`, 'ok');
    else out(hearOut, `Couldn’t change it: ${sensesProblem(r).message}`, 'err');
    render();
  }

  async function toggleSpeak(on) {
    if (busy.speak) return;
    // v7.8: the owner's own choice from now on (homeBaseSpeakBy 'owner'): never switched by itself again.
    // Off is this device's alone: the home base keeps George for the other devices (the iPhone and the
    // Mac each have their own switch), so nothing is asked of it.
    if (!on) {
      safe(() => commit({ homeBaseSpeak: false, homeBaseSpeakBy: 'owner' }));
      out(speakOut, `Off on ${devWord}: replies use its own voices. The home base keeps ${voiceName()} for your other devices.`, 'ok');
      render();
      return;
    }
    busy.speak = true;
    speakSw.disabled = true;
    out(speakOut, 'Turning it on at the home base…', 'busy');
    const r = await senses.save({ speak: { enabled: true } });
    busy.speak = false;
    speakSw.disabled = false;
    if (destroyed) return;
    if (r && r.ok) {
      safe(() => commit({ homeBaseSpeak: true, homeBaseSpeakBy: 'owner' }));
      out(speakOut, 'On. The home base gets the voice ready; until then replies sound as before.', 'ok');
    } else {
      speakSw.checked = false;
      out(speakOut, `Couldn’t turn it on: ${sensesProblem(r).message}`, 'err');
    }
    render();
  }

  // ---- tests ------------------------------------------------------------------------------------------
  /** Hearing: 3 seconds from this device's microphone, then what the home base heard. */
  async function testHear() {
    if (testing.hear) {
      testing.hear.cancel();
      return;
    }
    if (typeof createCapture !== 'function') return;
    let cancelled = false;
    let timer = 0;
    const cap = safe(() => createCapture({ processed: true }), null);
    if (!cap) return;
    safe(() => cap.prepare()); // inside the tap (iOS)
    const t = {
      cancel() {
        cancelled = true;
        clearTimeout(timer);
        safe(() => cap.close());
        testing.hear = null;
        setText(hearTestLabel, 'Test');
        out(hearOut, 'Test cancelled.', 'info');
        render();
      },
    };
    testing.hear = t;
    setText(hearTestLabel, 'Stop');
    hearTest.disabled = false;
    stopSpeaking();
    out(hearOut, 'Starting the microphone…', 'busy');
    const started = await cap.start({ clap: false, word: true, sensitivity: 'normal' }).catch(() => ({ ok: false, reason: 'error' }));
    if (cancelled || destroyed) return;
    const port = started && started.ok ? safe(() => cap.wordPort(), null) : null;
    if (!port) {
      safe(() => cap.close());
      testing.hear = null;
      setText(hearTestLabel, 'Test');
      out(hearOut, started && started.reason === 'denied' ? 'The microphone is blocked for Jarvis. Allow it in the browser’s settings, then try again.' : 'The microphone couldn’t start.', 'err');
      render();
      return;
    }
    const chunks = [];
    let n = 0;
    port.onmessage = (e) => {
      const m = e && e.data;
      if (m && m.type === 'frame' && m.samples && n < TEST_SECONDS * HEAR_SAMPLE_RATE) {
        chunks.push(new Float32Array(m.samples));
        n += m.samples.length;
      }
    };
    if (typeof port.start === 'function') port.start();
    out(hearOut, `Listening for ${TEST_SECONDS} seconds… say something.`, 'busy');
    await new Promise((resolve) => {
      timer = setTimeout(resolve, TEST_SECONDS * 1000 + 150);
    });
    if (cancelled || destroyed) return;
    safe(() => {
      port.onmessage = null;
      port.close();
    });
    safe(() => cap.close());
    const all = new Float32Array(Math.min(n, TEST_SECONDS * HEAR_SAMPLE_RATE));
    let at = 0;
    for (const c of chunks) {
      const take = Math.min(c.length, all.length - at);
      if (take <= 0) break;
      all.set(c.subarray(0, take), at);
      at += take;
    }
    out(hearOut, 'Sending it to the home base…', 'busy');
    const r = await senses.hear(encodeWav(all, HEAR_SAMPLE_RATE), { prompt: 'Jarvis', timeoutMs: TEST_HEAR_TIMEOUT_MS });
    if (cancelled || destroyed) return;
    testing.hear = null;
    setText(hearTestLabel, 'Test');
    if (r && r.ok) {
      const secs = (r.ms !== null ? r.ms : r.tookMs) / 1000;
      if (r.text) out(hearOut, `Heard in ${secs.toFixed(1)} s: “${r.text}”`, 'ok');
      else out(hearOut, `The home base heard no words (in ${secs.toFixed(1)} s). Try again a little closer.`, 'warn');
    } else out(hearOut, sensesProblem(r).message, 'err');
    render();
  }

  /** Voice: one sentence made by the home base, played here. */
  async function testSpeak() {
    if (testing.speak) {
      testing.speak.cancel();
      return;
    }
    let cancelled = false;
    let playing = null;
    const ctl = new AbortController();
    const t = {
      cancel() {
        cancelled = true;
        ctl.abort();
        if (playing) safe(() => playing.stop());
        testing.speak = null;
        setText(speakTestLabel, 'Test');
        out(speakOut, '');
        render();
      },
    };
    testing.speak = t;
    setText(speakTestLabel, 'Stop');
    speakTest.disabled = false;
    stopSpeaking();
    if (typeof unlockVoice === 'function') safe(() => unlockVoice()); // v7.8.1: a stuck output is started afresh in this tap
    if (audio) safe(() => audio.unlock()); // inside the tap (iOS)
    out(speakOut, 'Asking the home base for a sentence…', 'busy');
    const name = (settings().userName || '').trim();
    const line = `Good ${partOfDay()}${name ? `, ${name}` : ''}. This is my voice, made on your home base.`;
    const r = await senses.speak({ text: line, voice: settings().naturalVoiceId || 'bm_george', speed: 1 }, { timeoutMs: TEST_SPEAK_TIMEOUT_MS, signal: ctl.signal });
    if (cancelled || destroyed) return;
    if (!r || !r.ok) {
      testing.speak = null;
      setText(speakTestLabel, 'Test');
      out(speakOut, sensesProblem(r).message, 'err');
      render();
      return;
    }
    try {
      playing = audio ? audio.play(r.pcm, r.sampleRate, audio.now() + 0.05) : null;
    } catch {
      playing = null;
    }
    if (!playing) {
      testing.speak = null;
      setText(speakTestLabel, 'Test');
      out(speakOut, 'The home base made the sentence, but this browser couldn’t play it.', 'err');
      render();
      return;
    }
    out(speakOut, `Playing (made in ${(r.ms / 1000).toFixed(1)} s)…`, 'ok');
    const secs = playing.duration || r.pcm.length / r.sampleRate;
    const ctxAtPlay = safe(() => audio.context, null);
    // Jarvis left meanwhile (iOS stops its audio in the background): no verdict, as the stall watchdog.
    const away = watchAway();
    setTimeout(() => {
      const wasAway = away.done();
      if (cancelled || destroyed || testing.speak !== t) return;
      testing.speak = null;
      setText(speakTestLabel, 'Test');
      // v7.8.1: "Played" only when the audio clock got through the sentence's start. A stuck output (iOS after
      // an interruption) plays nothing without failing: say so plainly, and replies use the device voice.
      // Second review: Jarvis in the background meanwhile, or its sound restarted under the sample: the clock
      // can't tell, so it says that (no "Played", and nothing is marked stuck).
      const sameOutput = safe(() => audio.context, null) === ctxAtPlay;
      if (wasAway || !sameOutput) out(speakOut, unsureSampleText({ voiceName: voiceName(), away: wasAway }), 'info');
      else if (samplePlayed({ clock: safe(() => audio.now(), NaN), when: playing.when, duration: secs })) out(speakOut, `Played “${line}” (made on the home base in ${(r.ms / 1000).toFixed(1)} s).`, 'ok');
      else {
        out(speakOut, silentSampleText({ voiceName: voiceName(), os }), 'warn');
        if (typeof onSilent === 'function') safe(() => onSilent(audio));
      }
      render();
    }, Math.ceil(secs * 1000) + 200);
  }

  function partOfDay() {
    const hr = new Date().getHours();
    return hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  }

  let unwatch = senses.base() ? senses.watch() : null;
  const off = senses.subscribe((st) => {
    render();
    // Linked just now (Save): find out what this home base can hear and say, and keep it fresh.
    if (st && st.phase === 'idle' && st.url) {
      if (!unwatch) unwatch = senses.watch();
      else senses.load({ force: true });
    }
  });
  render();

  return {
    el,
    refresh: () => senses.load({ force: true }),
    destroy() {
      destroyed = true;
      if (testing.hear) safe(() => testing.hear.cancel());
      if (testing.speak) safe(() => testing.speak.cancel());
      if (typeof off === 'function') off();
      if (unwatch) safe(() => unwatch());
    },
  };
}
