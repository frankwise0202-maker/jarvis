// Settings → Voice → Microphone and speaker (v8.1, SPEC §28.2; Chrome or Edge on a computer): where Jarvis
// listens and speaks. Microphone ▾ and Speaker ▾ by name and connection; with a Bluetooth speakerphone, the
// Bluetooth facts and the three setups (the recommended one marked; "Custom" when the owner picks by hand);
// Test microphone, Test speaker and Compare; and the three-step Test hands-free, whose results are kept on
// this device (localStorage HANDS_FREE_TEST_KEY: Voice Mode's barge-in reads them). Every test starts inside
// the owner's tap, and nothing here opens a microphone otherwise ("Show my devices" included: only while the
// microphone isn't allowed, and let go at once). With nothing chosen Jarvis follows the Mac, as before.
//
//   const card = createAudioDevicesCard({ audio, stt, tts, createCapture, createWakeWord, getSettings,
//                                         commit, toast, storage, doc });
//     audio          src/platform/audio-devices.js's controller (null or unsupported: no card: returns null)
//     stt            stt.js's API as the app wraps it (audio.wrapStt: the chosen microphone's track)
//     tts            the voice router (George, else the Mac's own voice)
//     createCapture  (o) -> Standby's capture (capture.js) with the wake microphone (the real clap detector)
//     createWakeWord () -> the "Hey Jarvis" client, for the hands-free Test's second step (optional)
//   card.el · card.sync() · card.destroy()
//
//   const always = createAlwaysOnCard({ audio, getSettings, george, notifications, standalone });   (A10, SHOULD)
//     Settings → Voice, beside it: what keeps Jarvis listening and speaking day and night on this Mac, each line OK
//     or what to do: the microphone allowed, the chosen microphone connected, the Bluetooth note, on power
//     (navigator.getBattery), installed as an app, notifications, the wake words, George ready, the recognizer
//     on the chosen microphone, the hands-free Test's last results, and what a page can't see (told only).
//     Test ids: always-on, always-on-row (data-check, data-ok: 'true' | 'false' | 'told').
//
// Test ids: audio-devices, audio-devices-status, audio-devices-permission, audio-devices-show,
// audio-devices-facts, audio-devices-setups, audio-setup (data-setup), audio-setup-custom, audio-input,
// audio-output, audio-test-mic, audio-test-speaker, audio-compare, audio-test-handsfree, audio-test-status,
// audio-level (data-peak), audio-heard, audio-claps, audio-handsfree (data-step), audio-handsfree-yes,
// audio-handsfree-no, audio-handsfree-result (data-step, data-ok), audio-chrome-mic, audio-chrome-copy,
// audio-devices-notes

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import {
  ALWAYS_ON_TOLD,
  AUDIO_NOTES,
  AUDIO_SETUPS,
  alwaysOnChecks,
  BLUETOOTH_FACTS,
  CHROME_MIC_SETTINGS,
  HANDS_FREE_TEST_KEY,
  SETTLE_MS,
  chosenDevices,
  describeAudioDevice,
  deviceTitle,
  handsFreeLines,
  handsFreeMeasure,
  isBluetooth,
  normalizeHandsFreeTest,
  pickDevice,
  setupDevices,
  setupOf,
} from '../lib/audio-devices.js';
import { micPermission, showMyDevices, openMic, recognizerTakesTrack } from '../platform/audio-devices.js';
import { notifyPermission } from './attention.js';
import { isStandalone } from '../platform/env.js';
import { levelFromSamples } from '../platform/voice/natural/audio-out.js';
// Its stylesheet (src/styles/audio-devices.css) is imported by app.js: settings.js imports this module, and
// settings.js must stay importable in plain Node (its pure helpers' unit tests).

const MIC_TEST_MS = 5000;
const HIDDEN_TEST_MS = 10000;
const SELF_TEST_TAIL_MS = 1000;
const SAMPLE_LINE = 'Good day. This is how I sound through this speaker.';
const SELF_LINE = 'Jarvis here. This is a test: when I say Jarvis, I should not wake myself. Jarvis, out.';
const PROCESSED = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] Microphone and speaker card:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createAudioDevicesCard({ audio, stt = null, tts = null, createCapture = null, createWakeWord = null, getSettings = () => ({}), commit = () => ({}), toast = () => {}, storage = null, doc = globalThis.document } = {}) {
  if (!audio || !safe(() => audio.supported(), false)) return null;
  const settings = () => safe(() => getSettings() || {}, {});
  const store = storage || {
    get: (k) => safe(() => localStorage.getItem(k), null),
    set: (k, v) => safe(() => localStorage.setItem(k, v)),
  };
  let destroyed = false;
  let perm = 'unknown';
  let running = null; // { kind, cancel() }
  const offs = [];

  // ---- the elements -------------------------------------------------------------------------------------
  const title = h('div', { class: 'set-card-title' }, icon('speaker', { size: 16 }), h('span', { text: 'Microphone and speaker' }));
  const intro = h('p', { class: 'set-help set-help--card', text: 'Where Jarvis listens and speaks on this computer. With nothing chosen he follows the Mac’s own sound settings, as before: System Settings → Sound → Output (the speakerphone) and Input (the MacBook’s microphone) is the first setup below, with no setting here at all.' });
  const status = h('p', { class: 'ad-status', hidden: true, attrs: { role: 'status', 'data-testid': 'audio-devices-status' } });

  const showBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'audio-devices-show' }, on: { click: () => onShowDevices() } }, icon('eye', { size: 16 }), h('span', { text: 'Show my devices' }));
  const permRow = h('div', { class: 'ad-perm', hidden: true, attrs: { 'data-testid': 'audio-devices-permission' } }, h('p', { class: 'set-help', text: 'Jarvis can name your microphones and speakers once the microphone is allowed for this site. Until then only “Default” is offered.' }), showBtn);

  const facts = h('div', { class: 'ad-facts', hidden: true, attrs: { 'data-testid': 'audio-devices-facts' } }, h('p', { class: 'ad-facts-title', text: 'A Bluetooth speakerphone' }), ...BLUETOOTH_FACTS.map((f) => h('p', { class: 'set-help', text: f })));

  const setupInputs = new Map();
  const setupEls = AUDIO_SETUPS.map((s) => {
    const input = h('input', { type: 'radio', name: 'jarvis-audio-setup', value: s.id, attrs: { 'data-testid': 'audio-setup', 'data-setup': s.id }, on: { change: () => onSetup(s.id) } });
    setupInputs.set(s.id, input);
    const badges = [];
    if (s.recommended) badges.push(h('span', { class: 'ad-badge ad-badge--rec', text: 'Recommended' }));
    if (s.experimental) badges.push(h('span', { class: 'ad-badge', text: 'Experimental' }));
    return h('label', { class: 'ad-setup' }, input, h('span', { class: 'ad-setup-body' }, h('span', { class: 'ad-setup-title' }, h('span', { text: s.title }), ...badges), h('span', { class: 'ad-setup-text', text: s.text })));
  });
  const noneInput = h('input', { type: 'radio', name: 'jarvis-audio-setup', value: '', attrs: { 'data-testid': 'audio-setup', 'data-setup': 'none' }, on: { change: () => onSetup('') } });
  const noneEl = h('label', { class: 'ad-setup' }, noneInput, h('span', { class: 'ad-setup-body' }, h('span', { class: 'ad-setup-title', text: 'Follow the Mac' }), h('span', { class: 'ad-setup-text', text: 'Nothing chosen here: Jarvis uses the Mac’s sound settings, as before.' })));
  const customEl = h('p', { class: 'ad-custom', hidden: true, attrs: { 'data-testid': 'audio-setup-custom' } }, h('span', { class: 'ad-badge', text: 'Custom' }), h('span', { text: ' You picked the microphone and speaker by hand.' }));
  const setups = h('fieldset', { class: 'ad-setups', hidden: true, attrs: { 'data-testid': 'audio-devices-setups' } }, h('legend', { class: 'set-label', text: 'Setup' }), ...setupEls, noneEl, customEl);

  const inputSel = h('select', { class: 'select', id: 'set-audio-input', attrs: { 'data-testid': 'audio-input' }, on: { change: () => onPick('input', inputSel.value) } });
  const outputSel = h('select', { class: 'select', id: 'set-audio-output', attrs: { 'data-testid': 'audio-output' }, on: { change: () => onPick('output', outputSel.value) } });
  const field = (label, forId, control, help) => h('div', { class: 'ad-field' }, h('label', { class: 'set-label', attrs: { for: forId }, text: label }), control, help ? h('p', { class: 'set-help', text: help }) : null);
  const pickers = h('div', { class: 'ad-pickers' }, field('Microphone', 'set-audio-input', inputSel, 'Where your questions are heard.'), field('Speaker', 'set-audio-output', outputSel, 'George, the chimes and music previews all play here.'));

  const testMicLabel = h('span', { text: 'Test microphone' });
  const testSpeakerLabel = h('span', { text: 'Test speaker' });
  const compareLabel = h('span', { text: 'Compare' });
  const handsFreeLabel = h('span', { text: 'Test hands-free' });
  const testMicBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'audio-test-mic' }, on: { click: () => toggle('mic', testMic) } }, icon('mic', { size: 16 }), testMicLabel);
  const testSpeakerBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'audio-test-speaker' }, on: { click: () => toggle('speaker', testSpeaker) } }, icon('speaker', { size: 16 }), testSpeakerLabel);
  const compareBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'audio-compare', title: 'The same sentence with the speakerphone’s microphone closed, then open' }, on: { click: () => toggle('compare', compare) } }, icon('wave', { size: 16 }), compareLabel);
  const handsFreeBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'audio-test-handsfree' }, on: { click: () => toggle('handsfree', testHandsFree) } }, icon('sparkle', { size: 16 }), handsFreeLabel);
  const buttons = h('div', { class: 'set-row-actions ad-buttons' }, testMicBtn, testSpeakerBtn, compareBtn, handsFreeBtn);

  const testStatus = h('p', { class: 'set-help ad-test-status', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'audio-test-status' } });
  const levelBar = h('span', { class: 'ad-level-bar' });
  const level = h('div', { class: 'ad-level', hidden: true, attrs: { 'data-testid': 'audio-level', role: 'meter', 'aria-label': 'Microphone level', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' } }, levelBar);
  const heard = h('p', { class: 'set-help ad-heard', hidden: true, attrs: { 'data-testid': 'audio-heard' } });
  const claps = h('p', { class: 'set-help ad-claps', hidden: true, attrs: { 'data-testid': 'audio-claps' } });
  const yesBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'audio-handsfree-yes' } }, h('span', { text: 'Yes' }));
  const noBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'audio-handsfree-no' } }, h('span', { text: 'No' }));
  const askRow = h('div', { class: 'set-row-actions ad-ask', hidden: true }, yesBtn, noBtn);
  const hfStep = h('p', { class: 'ad-step', hidden: true, attrs: { 'data-testid': 'audio-handsfree', role: 'status', 'aria-live': 'polite' } });
  const hfResults = h('ul', { class: 'ad-results', hidden: true, attrs: { 'aria-label': 'The last hands-free Test' } });
  const results = h('div', { class: 'ad-tests' }, testStatus, level, heard, claps, hfStep, askRow, hfResults);

  const chromeText = h('span', { class: 'ad-chrome-text' });
  const chromeAddr = h('code', { class: 'ad-code', text: CHROME_MIC_SETTINGS });
  const copyBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'audio-chrome-copy', 'aria-label': 'Copy the address of Chrome’s microphone setting' }, on: { click: () => onCopy() } }, icon('copy', { size: 14 }), h('span', { text: 'Copy' }));
  const chromeNote = h('p', { class: 'set-help ad-chrome', attrs: { 'data-testid': 'audio-chrome-mic' } }, chromeText, ' ', chromeAddr, ' ', copyBtn);
  const lidNote = h('p', { class: 'set-help', hidden: true, text: AUDIO_NOTES.lid });
  const notes = h('div', { class: 'ad-notes', attrs: { 'data-testid': 'audio-devices-notes' } }, h('p', { class: 'set-help', text: AUDIO_NOTES.macVoice }), lidNote, chromeNote);

  const el = h('div', { class: 'set-card ad-card', attrs: { 'data-testid': 'audio-devices' } }, title, intro, status, permRow, facts, setups, pickers, buttons, results, notes);

  // ---- what is shown ---------------------------------------------------------------------------------------
  function effective(p, devices) {
    const mic = p.questionMic || devices.defaultInput || null;
    const speaker = p.speaker || devices.defaultOutput || null;
    return { mic, speaker };
  }

  function fill(select, list, remembered, def) {
    const pick = pickDevice(list, remembered);
    const opts = [h('option', { value: '', text: def ? `Default (${deviceTitle(def)})` : 'Default' })];
    for (const d of list) opts.push(h('option', { value: d.id, text: deviceTitle(d) }));
    if (remembered && pick.missing) opts.push(h('option', { value: '__missing', text: `${deviceTitle(describeAudioDevice({ kind: select === outputSel ? 'audiooutput' : 'audioinput', label: remembered.label }))} (not connected)` }));
    select.replaceChildren(...opts);
    select.value = pick.device ? pick.device.id : remembered && pick.missing ? '__missing' : '';
  }

  function render() {
    if (destroyed) return;
    const s = settings();
    const devices = audio.devices();
    const p = audio.plan();
    const chosen = chosenDevices(s);
    const setup = setupOf(s);
    const granted = perm === 'granted' || devices.labelled;
    permRow.hidden = granted;
    fill(inputSel, devices.inputs, chosen.input, devices.defaultInput);
    fill(outputSel, devices.outputs, chosen.output, devices.defaultOutput);
    const eff = effective(p, devices);
    const bluetooth = (!!eff.mic && isBluetooth(eff.mic.transport)) || (!!eff.speaker && isBluetooth(eff.speaker.transport));
    const showSetups = bluetooth || !!setup;
    facts.hidden = !showSetups;
    setups.hidden = !showSetups;
    lidNote.hidden = !showSetups;
    for (const [id, input] of setupInputs) input.checked = id === setup;
    noneInput.checked = !setup && p.none;
    customEl.hidden = !p.custom;
    el.dataset.setup = setup || (p.custom ? 'custom' : 'none');
    // A chosen device that isn't there.
    const gone = [];
    if (p.missing.input && chosen.input) gone.push(describeAudioDevice({ label: chosen.input.label }).name);
    if (p.missing.output && chosen.output) gone.push(describeAudioDevice({ kind: 'audiooutput', label: chosen.output.label }).name);
    const names = [...new Set(gone)];
    status.hidden = !names.length;
    if (names.length) setText(status, `Not connected: ${names.join(' and ')}. Jarvis uses the Mac’s ${p.missing.input && p.missing.output ? 'microphone and speakers' : p.missing.input ? 'microphone' : 'speakers'} until it’s back, and moves back by himself.`);
    // Chrome's own microphone: the recognizer can't be given one in this Chrome.
    const micName = p.questionMic ? p.questionMic.name : '';
    const noTrack = !!p.questionMic && !recognizerTakesTrack();
    chromeNote.classList.toggle('is-warn', noTrack);
    setText(chromeText, noTrack ? AUDIO_NOTES.chromeMic(micName) : 'Chrome’s own microphone setting (a page can’t open it; paste the address into a new tab):');
    const pair = speakerphoneMic(devices);
    compareBtn.disabled = !pair && running?.kind !== 'compare';
    renderResults();
  }

  /** The speakerphone's microphone (for Compare): the input of the planned (or default) speaker's group. */
  function speakerphoneMic(devices) {
    const p = audio.plan();
    const speaker = p.speaker || devices.defaultOutput;
    if (!speaker || !isBluetooth(speaker.transport)) return null;
    return devices.inputs.find((i) => (i.groupId && i.groupId === speaker.groupId) || (i.name === speaker.name && i.transport === speaker.transport)) || null;
  }

  function renderResults() {
    const r = normalizeHandsFreeTest(store.get(HANDS_FREE_TEST_KEY));
    // MAC-9: a passed step measured on another setup or other devices says to run the Test again.
    const lines = handsFreeLines(r, { now: handsFreeMeasure({ plan: safe(() => audio.plan(), null), settings: settings() }) });
    hfResults.hidden = !lines.length || running?.kind === 'handsfree';
    hfResults.replaceChildren(
      ...lines.map((l) => h('li', { class: 'ad-result', attrs: { 'data-testid': 'audio-handsfree-result', 'data-step': l.step, 'data-ok': l.ok === null ? 'unknown' : String(l.ok) } }, icon(l.ok === true ? 'check' : l.ok === false ? 'alert' : 'info', { size: 14 }), h('span', { text: l.text }))),
    );
  }

  // ---- choices -------------------------------------------------------------------------------------------------
  function onSetup(id) {
    if (!id) {
      commit({ audioSetup: '', audioInputId: '', audioInputLabel: '', audioOutputId: '', audioOutputLabel: '' });
      after();
      return;
    }
    const pick = setupDevices(id, audio.devices(), chosenDevices(settings()));
    commit({
      audioSetup: id,
      audioInputId: pick.input ? pick.input.id : '',
      audioInputLabel: pick.input ? pick.input.label : '',
      audioOutputId: pick.output ? pick.output.id : '',
      audioOutputLabel: pick.output ? pick.output.label : '',
    });
    after();
  }

  /** A device picked by hand: "Custom" (no setup), the other choice kept. */
  function onPick(role, value) {
    if (value === '__missing') return;
    const devices = audio.devices();
    const list = role === 'input' ? devices.inputs : devices.outputs;
    const d = value ? list.find((x) => x.id === value) : null;
    const patch = role === 'input' ? { audioInputId: d ? d.id : '', audioInputLabel: d ? d.label : '' } : { audioOutputId: d ? d.id : '', audioOutputLabel: d ? d.label : '' };
    commit({ audioSetup: '', ...patch });
    after();
  }

  function after() {
    safe(() => audio.settingsChanged());
    render();
  }

  async function onShowDevices() {
    showBtn.disabled = true;
    const r = await showMyDevices();
    showBtn.disabled = false;
    if (destroyed) return;
    if (!r.ok) safe(() => toast(r.reason === 'denied' ? 'The microphone is blocked for Jarvis. Allow it in Chrome’s site settings (the icon left of the address).' : 'The microphone couldn’t be opened.', { level: 'warn' }));
    perm = await micPermission();
    await audio.refresh();
    render();
  }

  async function onCopy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(CHROME_MIC_SETTINGS);
      ok = true;
    } catch {
      ok = false;
    }
    safe(() => toast(ok ? 'Copied. Paste it into a new tab’s address bar.' : `Copy this into a new tab: ${CHROME_MIC_SETTINGS}`, { level: ok ? 'success' : 'info' }));
  }

  // ---- tests (each inside the owner's tap) --------------------------------------------------------------------------
  const labels = { mic: [testMicLabel, 'Test microphone'], speaker: [testSpeakerLabel, 'Test speaker'], compare: [compareLabel, 'Compare'], handsfree: [handsFreeLabel, 'Test hands-free'] };
  const testButtons = { mic: testMicBtn, speaker: testSpeakerBtn, compare: compareBtn, handsfree: handsFreeBtn };

  function toggle(kind, fn) {
    if (running) {
      const was = running;
      stopRunning();
      if (was.kind === kind) return;
    }
    safe(() => tts && tts.unlockSpeech && tts.unlockSpeech()); // inside this tap: George may play
    const run = { kind, cancelled: false, cleanups: [], startedAt: 0 };
    running = run;
    setText(labels[kind][0], 'Stop');
    for (const [k, b] of Object.entries(testButtons)) b.classList.toggle('is-running', k === kind);
    heard.hidden = claps.hidden = hfStep.hidden = true;
    say('');
    render();
    Promise.resolve()
      .then(() => fn(run))
      .catch((err) => {
        console.warn('[jarvis] audio test failed:', err);
        if (!run.cancelled) say('The test couldn’t run here.');
      })
      .finally(() => finishRun(run));
  }

  function stopRunning() {
    const run = running;
    if (!run) return;
    run.cancelled = true;
    finishRun(run);
  }

  function finishRun(run) {
    for (const c of run.cleanups.splice(0)) safe(() => c());
    if (running !== run) return;
    running = null;
    setText(labels[run.kind][0], labels[run.kind][1]);
    for (const b of Object.values(testButtons)) b.classList.remove('is-running');
    level.hidden = true;
    askRow.hidden = true;
    render();
  }

  function say(text) {
    testStatus.hidden = !text;
    setText(testStatus, text || '');
  }

  /** Test microphone (5 s): a level bar, what the recognizer heard, and claps through the real detector. */
  async function testMic(run) {
    say('Listening for 5 seconds: say something, then clap twice.');
    heard.hidden = false;
    setText(heard, 'Heard: …');
    claps.hidden = false;
    setText(claps, 'Clap twice now.');
    level.hidden = false;
    level.dataset.peak = '0';
    // The real Standby detector, on the wake microphone (inside this tap: its audio starts here).
    let clapped = false;
    let cap = null;
    if (typeof createCapture === 'function') {
      cap = safe(() => createCapture({ onClap: () => (clapped = true) }), null);
      if (cap) {
        safe(() => cap.prepare());
        run.cleanups.push(() => cap.close());
        cap.start({ clap: true, word: false, sensitivity: settings().wakeClapSensitivity || 'normal' }).catch(() => null);
      }
    }
    // The recognizer on the question microphone (the app's wrapper hands it the chosen one's track).
    let words = '';
    if (stt && typeof stt.startListening === 'function') {
      const handle = safe(
        () =>
          stt.startListening({
            lang: settings().listenLang || '',
            wait: 'short',
            maxMs: MIC_TEST_MS,
            noSpeechMs: MIC_TEST_MS,
            onPartial: (t) => {
              words = String(t || '');
              setText(heard, `Heard: ${words || '…'}`);
            },
            onFinal: (t) => {
              words = String(t || '');
              setText(heard, `Heard: ${words}`);
            },
            onError: () => {},
            onEnd: () => {},
          }),
        null,
      );
      if (handle) run.cleanups.push(() => safe(() => handle.abort()));
    }
    // The level, on its own track of the same microphone.
    const meter = await openLevel(audio.questionAudio() || { id: '', processing: PROCESSED });
    if (meter) run.cleanups.push(() => meter.close());
    const until = Date.now() + MIC_TEST_MS;
    while (!run.cancelled && Date.now() < until) {
      if (meter) {
        const v = meter.read();
        levelBar.style.width = `${Math.round(v * 100)}%`;
        level.setAttribute('aria-valuenow', String(Math.round(v * 100)));
        if (v > Number(level.dataset.peak || 0)) level.dataset.peak = String(Math.round(v * 100) / 100);
      }
      if (clapped) setText(claps, 'Two claps heard.');
      await wait(80);
    }
    if (run.cancelled) return;
    setText(heard, words ? `Heard: ${words}` : 'Heard nothing. Check the microphone, or speak a little louder.');
    setText(claps, clapped ? 'Two claps heard.' : 'No claps heard. (Through a speakerphone claps can come out softer: “Hey Jarvis” works too.)');
    say('');
  }

  /** A level meter on a track of the microphone: { read() -> 0..1, close() } or null. */
  async function openLevel(want) {
    let mic = null;
    try {
      mic = await openMic(want);
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(new MediaStream([mic.track]));
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      return {
        read() {
          an.getFloatTimeDomainData(buf);
          return levelFromSamples(buf);
        },
        close() {
          safe(() => ctx.close().catch(() => {}));
          mic.stop();
        },
      };
    } catch {
      if (mic) mic.stop();
      return null;
    }
  }

  /** One sentence the way replies are spoken (George through the chosen speaker), inside the tap. */
  function speakOnce(run, line) {
    return new Promise((resolve) => {
      if (!tts || typeof tts.speak !== 'function') {
        resolve(null);
        return;
      }
      let engine = null;
      const off = typeof tts.onVoiceChange === 'function' ? tts.onVoiceChange((e) => e && (engine = engine || e)) : null;
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        if (typeof off === 'function') off();
        resolve(engine || safe(() => tts.voiceNow && tts.voiceNow(), null) || 'device');
      };
      try {
        const s = settings();
        const handle = tts.speak(line, { voiceURI: s.voiceURI, rate: s.voiceRate, onEnd: () => end() });
        run.cleanups.push(() => {
          safe(() => handle && handle.cancel && handle.cancel());
          end();
        });
      } catch {
        end();
      }
    });
  }

  const georgeSpoke = (engine) => engine === 'homebase' || engine === 'natural';

  async function testSpeaker(run) {
    say('George is speaking through the chosen speaker…');
    const engine = await speakOnce(run, SAMPLE_LINE);
    if (run.cancelled) return;
    say(georgeSpoke(engine) ? 'Done. That was George, through the chosen speaker.' : 'George isn’t ready, so the Mac’s own voice said it, through the Mac’s sound output.');
  }

  /** The same sentence with the speakerphone's microphone closed, then open (its phone-call mode). */
  async function compare(run) {
    const micDev = speakerphoneMic(audio.devices());
    if (!micDev) {
      say('There is no speakerphone microphone to compare with.');
      return;
    }
    say('1 of 2: the speakerphone’s microphone closed.');
    await speakOnce(run, SAMPLE_LINE);
    if (run.cancelled) return;
    say('2 of 2: the speakerphone’s microphone open (its phone-call mode).');
    let mic = null;
    try {
      mic = await openMic({ id: micDev.id, processing: PROCESSED });
    } catch {
      mic = null;
    }
    if (mic) run.cleanups.push(() => mic.stop());
    if (run.cancelled) return;
    await wait(SETTLE_MS);
    if (run.cancelled) return;
    await speakOnce(run, SAMPLE_LINE);
    if (mic) mic.stop();
    if (run.cancelled) return;
    say(mic ? 'Done. The second time is how George sounds while a Bluetooth microphone is open.' : 'The speakerphone’s microphone couldn’t be opened.');
  }

  // ---- Test hands-free ------------------------------------------------------------------------------------------------
  function saveResult(patch) {
    const prev = normalizeHandsFreeTest(store.get(HANDS_FREE_TEST_KEY));
    const base = prev && running && running.startedAt && prev.at === running.startedAt ? prev : { at: running ? running.startedAt : Date.now(), hiddenWords: null, selfTrigger: null, heardSpeaker: null };
    const next = normalizeHandsFreeTest({ ...base, ...patch });
    if (next) store.set(HANDS_FREE_TEST_KEY, JSON.stringify(next));
  }

  async function testHandsFree(run) {
    run.startedAt = Date.now();
    saveResult({});
    hfResults.hidden = true;
    // Step 1: words heard while Jarvis is in the background.
    hfStep.hidden = false;
    hfStep.dataset.step = '1';
    setText(hfStep, '1 of 3: Switch to another app now, then say “testing” within 10 seconds.');
    const hidden = await hiddenWords(run);
    if (run.cancelled) return;
    saveResult({ hiddenWords: hidden });
    // Step 2: George saying "Jarvis" while the wake detector listens on the wake microphone.
    hfStep.dataset.step = '2';
    setText(hfStep, '2 of 3: George says “Jarvis” while the wake microphone listens. Stay quiet.');
    const self = await selfTrigger(run);
    if (run.cancelled) return;
    saveResult({ selfTrigger: self, measured: self ? run.measured || null : null }); // MAC-9: and what it measured
    // Step 3: where George came from.
    hfStep.dataset.step = '3';
    setText(hfStep, '3 of 3: Did you hear that from the speakerphone?');
    askRow.hidden = false;
    const answer = await new Promise((resolve) => {
      const yes = () => resolve(true);
      const no = () => resolve(false);
      yesBtn.addEventListener('click', yes, { once: true });
      noBtn.addEventListener('click', no, { once: true });
      run.cleanups.push(() => {
        yesBtn.removeEventListener('click', yes);
        noBtn.removeEventListener('click', no);
        resolve(null);
      });
    });
    askRow.hidden = true;
    if (run.cancelled || answer === null) return;
    saveResult({ heardSpeaker: answer });
    hfStep.hidden = true;
    say('Done. The results are kept on this computer.');
  }

  /** Step 1: true when words arrived while Jarvis was hidden, false when none did, null when he never was. */
  function hiddenWords(run) {
    return new Promise((resolve) => {
      if (!stt || typeof stt.startListening !== 'function' || !doc) {
        resolve(null);
        return;
      }
      let wasHidden = !!doc.hidden;
      let heardHidden = false;
      let handle = null;
      let timer = 0;
      let done = false;
      const onVis = () => {
        if (doc.hidden) wasHidden = true;
      };
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        doc.removeEventListener('visibilitychange', onVis);
        safe(() => handle && handle.abort());
        resolve(wasHidden ? heardHidden : null);
      };
      const words = (t) => {
        if (!String(t || '').trim()) return;
        if (doc.hidden) {
          heardHidden = true;
          finish();
        }
      };
      doc.addEventListener('visibilitychange', onVis);
      run.cleanups.push(finish);
      timer = setTimeout(finish, HIDDEN_TEST_MS);
      handle = safe(
        () =>
          stt.startListening({
            lang: settings().listenLang || '',
            wait: 'short',
            maxMs: HIDDEN_TEST_MS + 2000,
            noSpeechMs: HIDDEN_TEST_MS + 2000,
            keepListening: true,
            background: true, // v8.1: no give-up while hidden (stt.js, where the build has it)
            onPartial: words,
            onFinal: words,
            onError: () => {},
            onEnd: () => {},
          }),
        null,
      );
    });
  }

  /** Step 2: 'passed' when George's "Jarvis" didn't wake the detector, 'failed' when it did, null when untested. */
  async function selfTrigger(run) {
    if (typeof createCapture !== 'function') return null;
    let fired = false;
    const cap = safe(() => createCapture({ onClap: () => (fired = true) }), null);
    if (!cap) return null;
    run.cleanups.push(() => cap.close());
    safe(() => cap.prepare());
    const s = settings();
    const plan = safe(() => audio.plan(), null); // the wake microphone and the speaker this step measures
    const wordOn = s.wakeWord === true && typeof createWakeWord === 'function';
    let wordHeard = false; // "Hey Jarvis" really listened (its download may not be ready)
    const r = await cap.start({ clap: s.wakeClap !== false, word: wordOn, sensitivity: s.wakeClapSensitivity || 'normal' }).catch(() => ({ ok: false }));
    if (run.cancelled || !r || !r.ok) return null;
    if (wordOn) {
      const word = safe(() => createWakeWord(), null);
      if (word) {
        run.cleanups.push(() => safe(() => word.stop()));
        const offDetect = safe(() => word.onDetect(() => (fired = true)), null);
        if (typeof offDetect === 'function') run.cleanups.push(offDetect);
        await Promise.race([Promise.resolve(word.start()).catch(() => null), wait(4000)]);
        if (word.status && word.status().state === 'ready') {
          const port = cap.wordPort();
          if (port && word.attach(port)) {
            cap.configure({ word: true });
            wordHeard = true;
          }
        }
      }
    }
    if (run.cancelled) return null;
    const engine = await speakOnce(run, SELF_LINE);
    if (run.cancelled) return null;
    await wait(SELF_TEST_TAIL_MS);
    // Barge-in works only while George speaks: the Mac's own voice is played by macOS, outside Chrome's echo
    // reference, so a sentence it said tells nothing either way.
    if (!georgeSpoke(engine)) return null;
    // MAC-9: barge-in counts this result only for what it measured: this setup, wake microphone and speaker, and
    // the wake detectors that listened (claps, and "Hey Jarvis" only if it was ready).
    run.measured = handsFreeMeasure({ plan, settings: { ...s, wakeWord: wordHeard } });
    return fired ? 'failed' : 'passed';
  }

  // ---- life ---------------------------------------------------------------------------------------------------
  offs.push(safe(() => audio.subscribe(() => render()), null));
  const md = safe(() => navigator.mediaDevices, null);
  if (md && typeof md.addEventListener === 'function') {
    const onChange = () => safe(() => audio.check());
    md.addEventListener('devicechange', onChange);
    offs.push(() => md.removeEventListener('devicechange', onChange));
  }
  micPermission().then((p) => {
    perm = p;
    if (!destroyed) render();
  });
  Promise.resolve(audio.refresh()).then(() => render(), () => render());
  render();

  return {
    el,
    sync: () => render(),
    destroy() {
      destroyed = true;
      stopRunning();
      for (const off of offs) safe(() => typeof off === 'function' && off());
    },
  };
}

// ---- A10 (SHOULD): the "Always on" card ------------------------------------------------------------------------

export function createAlwaysOnCard({ audio, getSettings = () => ({}), george = () => null, notifications = notifyPermission, standalone = isStandalone, storage = null, scope = globalThis } = {}) {
  if (!audio || !safe(() => audio.supported(), false)) return null;
  const store = storage || { get: (k) => safe(() => localStorage.getItem(k), null) };
  let destroyed = false;
  let mic = 'unknown';
  let power = null;
  let battery = null;
  const offs = [];
  const list = h('ul', { class: 'ad-results ao-list', attrs: { 'aria-label': 'Always on' } });
  const told = h('ul', { class: 'ad-results ao-told', attrs: { 'aria-label': 'What Jarvis can’t check' } }, ...ALWAYS_ON_TOLD.map((t) => h('li', { class: 'ad-result', attrs: { 'data-testid': 'always-on-row', 'data-check': 'told', 'data-ok': 'told' } }, icon('info', { size: 14 }), h('span', { text: t }))));
  const el = h(
    'div',
    { class: 'set-card ad-card ao-card', attrs: { 'data-testid': 'always-on' } },
    h('div', { class: 'set-card-title' }, icon('moon', { size: 16 }), h('span', { text: 'Always on' })),
    h('p', { class: 'set-help set-help--card', text: 'What keeps Jarvis listening and speaking on this Mac day and night. Each line is checked now, or says what to do.' }),
    list,
    h('p', { class: 'set-label ao-told-title', text: 'Jarvis can’t see these: check them once' }),
    told,
  );

  function render() {
    if (destroyed) return;
    const rows = alwaysOnChecks({
      mic,
      plan: safe(() => audio.plan(), null),
      devices: safe(() => audio.devices(), null),
      power,
      installed: !!safe(() => standalone(), false),
      notifications: safe(() => notifications(), 'unsupported'),
      settings: safe(() => getSettings() || {}, {}),
      george: safe(() => george(), null),
      trackUse: safe(() => audio.trackUse(), null),
      takesTrack: recognizerTakesTrack(scope),
      test: store.get(HANDS_FREE_TEST_KEY),
    });
    list.replaceChildren(
      ...rows.map((r) => h('li', { class: 'ad-result', attrs: { 'data-testid': 'always-on-row', 'data-check': r.check, 'data-ok': r.ok === null ? 'unknown' : String(r.ok) } }, icon(r.ok === true ? 'check' : r.ok === false ? 'alert' : 'info', { size: 14 }), h('span', { text: r.text }))),
    );
  }

  offs.push(safe(() => audio.subscribe(() => render()), null));
  micPermission(scope).then((p) => {
    mic = p;
    render();
  });
  try {
    const nav = scope.navigator;
    if (nav && typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((b) => {
          if (destroyed || !b) return;
          battery = b;
          power = !!b.charging;
          const onCharge = () => {
            power = !!b.charging;
            render();
          };
          b.addEventListener('chargingchange', onCharge);
          offs.push(() => b.removeEventListener('chargingchange', onCharge));
          render();
        })
        .catch(() => {});
    }
  } catch {
    /* no battery API: the line says so */
  }
  render();

  return {
    el,
    sync: () => render(),
    destroy() {
      destroyed = true;
      battery = null;
      for (const off of offs) safe(() => typeof off === 'function' && off());
    },
  };
}
