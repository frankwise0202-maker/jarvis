// Settings panel (shown in a full-screen sheet on phones, a dialog on desktop).
// Sections: Profile, AI, Voice, Location, Memory, API key & spending, Data, Install, About.
// Every control writes through saveSettings() immediately (text fields on change and
// after a short pause while typing) and follows changes made elsewhere.

import { h, setText, extLink } from './dom.js';
import { icon } from './icons.js';
import { getSettings, saveSettings, onSettingsChange } from '../platform/settings.js';
import { getApiKey, setApiKey, clearApiKey, maskKey, looksLikeApiKey } from '../platform/secrets.js';
import { listMemory, addMemory, removeMemory, clearMemory, onMemoryChange } from '../platform/memory.js';
import { getSpend, onSpendChange } from '../platform/spend.js';
import { exportBackup, importBackup } from '../platform/backup.js';
import { isPersistent } from '../platform/db.js';
import { isStandalone } from '../platform/env.js';
import { ttsSupported, getVoices, pickDefaultVoice, speak, stopSpeaking } from '../platform/voice/tts.js';
import { sttSupported } from '../platform/voice/stt.js';
import { MODELS, DEPTHS, MODES } from '../engine/index.js';
import { createThemePicker, applyTheme } from './themes.js';
import * as sounds from './sounds.js';
import { notifyPermission, requestNotifyPermission, explainNotifyPermission } from './attention.js';

export const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile & style', short: 'Profile', icon: 'user' },
  { id: 'ai', label: 'AI', icon: 'chip' },
  { id: 'voice', label: 'Voice', icon: 'wave' },
  { id: 'appearance', label: 'Appearance & sound', short: 'Appearance', icon: 'sparkle' },
  { id: 'location', label: 'Location', icon: 'pin' },
  { id: 'memory', label: 'Memory', icon: 'memory' },
  { id: 'apikey', label: 'API key & spending', short: 'API key', icon: 'key' },
  { id: 'data', label: 'Data', icon: 'layers' },
  { id: 'install', label: 'Install', icon: 'download' },
  { id: 'about', label: 'About', icon: 'info' },
];

const LIMITS = {
  maxAgents: { min: 1, max: 20 },
  maxParallel: { min: 1, max: 10 },
  maxWaves: { min: 1, max: 4 },
  voiceRate: { min: 0.7, max: 1.5, step: 0.05 },
  spendWarnUsd: { min: 0, max: 100000 },
};

const MODEL_NOTES = {
  'claude-opus-5-5': 'most capable',
  'claude-sonnet-5-5': 'fast and capable',
  'claude-haiku-5-5': 'fastest, lowest cost',
};

// Jarvis's personality (SPEC §15.1): the engine adds a "Style:" line to each turn's context.
const TONE_OPTIONS = [
  { value: 'butler', label: 'Butler (polished, dry wit)' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'playful', label: 'Playful' },
];
const VERBOSITY_OPTIONS = [
  { value: 'concise', label: 'Concise' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed' },
];

const LANGS = [
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['en-AU', 'English (Australia)'],
  ['en-CA', 'English (Canada)'],
  ['en-IN', 'English (India)'],
  ['en-IE', 'English (Ireland)'],
  ['en-NZ', 'English (New Zealand)'],
  ['en-ZA', 'English (South Africa)'],
  ['de-DE', 'Deutsch'],
  ['es-ES', 'Español (España)'],
  ['es-MX', 'Español (México)'],
  ['fr-FR', 'Français'],
  ['fr-CA', 'Français (Canada)'],
  ['it-IT', 'Italiano'],
  ['nl-NL', 'Nederlands'],
  ['pt-BR', 'Português (Brasil)'],
  ['pt-PT', 'Português (Portugal)'],
  ['sv-SE', 'Svenska'],
  ['pl-PL', 'Polski'],
  ['ja-JP', '日本語'],
  ['ko-KR', '한국어'],
  ['zh-CN', '中文 (简体)'],
  ['zh-TW', '中文 (繁體)'],
  ['hi-IN', 'हिन्दी'],
];

const CONSOLE = {
  keys: 'https://console.anthropic.com/settings/keys',
  billing: 'https://console.anthropic.com/settings/billing',
  limits: 'https://console.anthropic.com/settings/limits',
  usage: 'https://console.anthropic.com/usage',
};

function money(v) {
  const n = Number(v) || 0;
  return n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

function metaContent(name) {
  const m = document.querySelector(`meta[name="${name}"]`);
  const v = m ? m.getAttribute('content') || '' : '';
  return v && !v.startsWith('__') ? v : '';
}

/**
 * @param {object} o
 * @param {(key: string) => Promise<{ok: boolean, error?: object}>} o.testApiKey
 * @param {() => void} o.onKeyChanged
 * @param {() => void} o.openInstallGuide
 * @param {() => void} [o.openSystems]   opens the Systems dashboard (SPEC §14.4)
 * @param {() => Promise<void>} o.deleteAllConversations
 * @param {() => Promise<void>} o.resetApp
 * @param {() => void} o.refreshHistory
 * @param {() => void} o.replayOnboarding
 * @param {(msg: string, opts?: object) => void} o.toast
 * @param {boolean} [o.demo]
 */
export function createSettingsPanel(o) {
  const controls = new Map(); // settings key -> { set(value) }
  const cleanups = [];
  const timers = new Set();
  let s = getSettings();

  // ---- generic controls -------------------------------------------------------------
  function commit(patch) {
    try {
      s = saveSettings(patch);
    } catch (err) {
      console.error('[jarvis] saveSettings failed:', err);
      o.toast('Couldn’t save that setting.', { level: 'error' });
    }
    return s;
  }

  function fieldId(key) {
    return `set-${key}`;
  }

  function row({ label, help, control, forId, stacked, extra }) {
    return h(
      'div',
      { class: ['set-row', stacked && 'set-row--stacked'] },
      h('div', { class: 'set-row-text' }, forId ? h('label', { class: 'set-label', attrs: { for: forId }, text: label }) : h('span', { class: 'set-label', text: label }), help ? h('p', { class: 'set-help', text: help }) : null),
      h('div', { class: 'set-row-control' }, control),
      extra || null,
    );
  }

  function textField(key, { placeholder, maxLength, autocomplete = 'off', type = 'text' } = {}) {
    let timer = 0;
    timers.add(() => clearTimeout(timer));
    const input = h('input', {
      class: 'input',
      id: fieldId(key),
      type,
      value: s[key] || '',
      placeholder: placeholder || '',
      maxLength: maxLength || 120,
      attrs: { 'data-testid': `setting-${key}`, autocomplete, spellcheck: 'false' },
      on: {
        input: () => {
          clearTimeout(timer);
          timer = setTimeout(save, 450);
        },
        change: () => save(),
        keydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
            input.blur();
          }
        },
      },
    });
    function save() {
      clearTimeout(timer);
      const next = commit({ [key]: input.value });
      if (document.activeElement !== input && input.value !== next[key]) input.value = next[key];
    }
    controls.set(key, {
      set(v) {
        if (document.activeElement !== input) input.value = v || '';
      },
      flush: save,
    });
    return input;
  }

  function selectField(key, options) {
    const select = h(
      'select',
      {
        class: 'select',
        id: fieldId(key),
        attrs: { 'data-testid': `setting-${key}` },
        on: { change: () => commit({ [key]: select.value }) },
      },
      options.map((opt) => h('option', { value: opt.value, text: opt.label })),
    );
    select.value = String(s[key]);
    controls.set(key, {
      set(v) {
        select.value = String(v);
      },
    });
    return select;
  }

  function switchField(key, { label, get = (st) => st[key], patch = (v) => ({ [key]: v }), testid } = {}) {
    const input = h('input', {
      class: 'switch',
      type: 'checkbox',
      id: fieldId(testid || key),
      checked: !!get(s),
      attrs: { role: 'switch', 'data-testid': `setting-${testid || key}`, 'aria-label': label || null },
      on: { change: () => commit(patch(input.checked)) },
    });
    controls.set(testid || key, {
      set(_v, st) {
        input.checked = !!get(st);
      },
    });
    return input;
  }

  function stepperField(key, { min, max, step = 1 }) {
    const input = h('input', {
      class: 'input stepper-input',
      id: fieldId(key),
      type: 'number',
      value: String(s[key]),
      min,
      max,
      step,
      attrs: { 'data-testid': `setting-${key}`, inputmode: 'numeric' },
      on: {
        change: () => save(Number(input.value)),
        keydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save(Number(input.value));
          }
        },
      },
    });
    const dec = h('button', { class: 'stepper-btn', type: 'button', attrs: { 'aria-label': 'Decrease' }, on: { click: () => save(Number(s[key]) - step) } }, h('span', { class: 'stepper-glyph', text: '−' }));
    const inc = h('button', { class: 'stepper-btn', type: 'button', attrs: { 'aria-label': 'Increase' }, on: { click: () => save(Number(s[key]) + step) } }, h('span', { class: 'stepper-glyph', text: '+' }));
    function sync(v) {
      input.value = String(v);
      dec.disabled = v <= min;
      inc.disabled = v >= max;
    }
    function save(v) {
      if (!Number.isFinite(v)) {
        sync(s[key]);
        return;
      }
      const next = commit({ [key]: Math.min(max, Math.max(min, Math.round(v))) });
      sync(next[key]);
    }
    sync(s[key]);
    controls.set(key, { set: (v) => sync(v) });
    return h('div', { class: 'stepper' }, dec, input, inc);
  }

  // ---- sections ---------------------------------------------------------------------
  const sectionEls = {};
  function section(id, ...children) {
    const meta = SETTINGS_SECTIONS.find((x) => x.id === id);
    const el = h(
      'section',
      { class: 'set-section', id: `settings-${id}`, attrs: { 'aria-labelledby': `settings-${id}-title`, 'data-section': id } },
      h('h3', { class: 'set-section-title', id: `settings-${id}-title` }, icon(meta.icon, { size: 16 }), h('span', { text: meta.label })),
      ...children,
    );
    sectionEls[id] = el;
    return el;
  }
  const card = (...children) => h('div', { class: 'set-card' }, ...children);

  // Profile
  const profile = section(
    'profile',
    card(
      row({
        label: 'Your name',
        help: 'How Jarvis addresses you. Leave empty and Jarvis will call you “sir”.',
        forId: fieldId('userName'),
        control: textField('userName', { placeholder: 'sir', maxLength: 40, autocomplete: 'given-name' }),
        stacked: true,
      }),
    ),
    card(
      row({
        label: 'Jarvis’s style',
        help: 'How Jarvis sounds when it talks to you. Takes effect from your next message.',
        forId: fieldId('tone'),
        control: selectField('tone', TONE_OPTIONS),
        stacked: true,
      }),
      row({
        label: 'Answer length',
        help: 'Concise keeps replies short; Detailed adds depth, context and examples.',
        forId: fieldId('verbosity'),
        control: selectField('verbosity', VERBOSITY_OPTIONS),
        stacked: true,
      }),
    ),
  );

  // AI
  const modelOptions = Object.keys(MODELS || {}).map((id) => ({ value: id, label: `${MODELS[id].label}${MODEL_NOTES[id] ? ` — ${MODEL_NOTES[id]}` : ''}` }));
  const depthOptions = Object.keys(DEPTHS || {}).map((id) => {
    const d = DEPTHS[id];
    return { value: id, label: `${d.label} — up to ${d.workerSearches} searches per agent` };
  });
  const modeOptions = Object.keys(MODES || {}).map((id) => ({ value: id, label: MODES[id] }));
  const ai = section(
    'ai',
    card(
      row({ label: 'Jarvis model', help: 'Leads the conversation and writes the final answer.', forId: fieldId('leadModel'), control: selectField('leadModel', modelOptions), stacked: true }),
      row({ label: 'Agent model', help: 'Used by each research agent in a swarm.', forId: fieldId('workerModel'), control: selectField('workerModel', modelOptions), stacked: true }),
      row({ label: 'Research depth', help: 'Deeper means more searches, more thinking and higher cost.', forId: fieldId('depth'), control: selectField('depth', depthOptions), stacked: true }),
      row({ label: 'Default mode', help: 'Auto decides for you; Quick never deploys agents; Swarm always does.', forId: fieldId('mode'), control: selectField('mode', modeOptions), stacked: true }),
    ),
    card(
      row({ label: 'Agents per wave', help: 'Most agents Jarvis can deploy at once (1–20).', forId: fieldId('maxAgents'), control: stepperField('maxAgents', LIMITS.maxAgents) }),
      row({ label: 'Running in parallel', help: 'Agents working at the same time (1–10). Lower it if you hit rate limits.', forId: fieldId('maxParallel'), control: stepperField('maxParallel', LIMITS.maxParallel) }),
      row({ label: 'Waves per request', help: 'Follow-up waves Jarvis may launch to fill gaps (1–4).', forId: fieldId('maxWaves'), control: stepperField('maxWaves', LIMITS.maxWaves) }),
    ),
    card(
      row({ label: 'Show thinking', help: 'Show a summary of Jarvis’s reasoning above each answer.', forId: fieldId('showThinking'), control: switchField('showThinking', { label: 'Show thinking' }) }),
      row({
        label: 'Suggest follow-up questions',
        help: 'After each answer, Claude Haiku suggests up to three next questions (a tiny fraction of a cent).',
        forId: fieldId('followups'),
        control: switchField('followups', { label: 'Suggest follow-up questions' }),
      }),
      row({
        label: 'Model fallbacks',
        help: 'Let Anthropic retry with a fallback model when needed. Turned off automatically if unsupported.',
        forId: fieldId('fallbacks'),
        control: switchField('features', { label: 'Model fallbacks', testid: 'fallbacks', get: (st) => st.features && st.features.fallbacks, patch: (v) => ({ features: { fallbacks: v } }) }),
      }),
      row({
        label: 'Long-chat compaction',
        help: 'Summarize older context automatically in very long conversations.',
        forId: fieldId('compaction'),
        control: switchField('features', { label: 'Long-chat compaction', testid: 'compaction', get: (st) => st.features && st.features.compaction, patch: (v) => ({ features: { compaction: v } }) }),
      }),
    ),
  );

  // Voice
  const ttsOk = safeCall(ttsSupported, false);
  const sttOk = safeCall(sttSupported, false);
  const voiceSelect = h(
    'select',
    { class: 'select', id: fieldId('voiceURI'), attrs: { 'data-testid': 'setting-voiceURI' }, disabled: !ttsOk, on: { change: () => commit({ voiceURI: voiceSelect.value }) } },
    h('option', { value: '', text: 'Automatic (British voice if available)' }),
  );
  controls.set('voiceURI', {
    set(v) {
      ensureOption(voiceSelect, v, v);
      voiceSelect.value = v;
    },
  });
  if (s.voiceURI) ensureOption(voiceSelect, s.voiceURI, s.voiceURI);
  voiceSelect.value = s.voiceURI;
  if (ttsOk) {
    Promise.resolve()
      .then(() => getVoices())
      .then((voices) => fillVoices(voices))
      .catch((err) => console.error('[jarvis] getVoices failed:', err));
  }
  function fillVoices(voices) {
    const list = Array.isArray(voices) ? voices.slice() : [];
    let auto = null;
    try {
      auto = pickDefaultVoice(list);
    } catch {
      auto = null;
    }
    const rank = (v) => (/^en-GB/i.test(v.lang) ? 0 : /^en/i.test(v.lang) ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
    const current = getSettings().voiceURI;
    voiceSelect.replaceChildren(
      h('option', { value: '', text: auto ? `Automatic — ${auto.name}` : 'Automatic (British voice if available)' }),
      ...list.map((v) => h('option', { value: v.voiceURI, text: `${v.name} (${v.lang})` })),
    );
    if (current && !list.some((v) => v.voiceURI === current)) ensureOption(voiceSelect, current, `${current} (not on this device)`);
    voiceSelect.value = current;
  }

  const rateOut = h('output', { class: 'range-out', attrs: { for: fieldId('voiceRate') } });
  const rate = h('input', {
    class: 'range',
    type: 'range',
    id: fieldId('voiceRate'),
    min: LIMITS.voiceRate.min,
    max: LIMITS.voiceRate.max,
    step: LIMITS.voiceRate.step,
    value: String(s.voiceRate),
    disabled: !ttsOk,
    attrs: { 'data-testid': 'setting-voiceRate' },
    on: {
      input: () => setText(rateOut, `${Number(rate.value).toFixed(2)}×`),
      change: () => {
        const next = commit({ voiceRate: Number(rate.value) });
        rate.value = String(next.voiceRate);
        setText(rateOut, `${Number(next.voiceRate).toFixed(2)}×`);
      },
    },
  });
  setText(rateOut, `${Number(s.voiceRate).toFixed(2)}×`);
  controls.set('voiceRate', {
    set(v) {
      rate.value = String(v);
      setText(rateOut, `${Number(v).toFixed(2)}×`);
    },
  });

  const langOptions = LANGS.map(([value, label]) => ({ value, label: `${label} · ${value}` }));
  if (!LANGS.some(([v]) => v === s.listenLang)) langOptions.unshift({ value: s.listenLang, label: s.listenLang });
  let testing = null;
  const testVoiceBtn = h(
    'button',
    {
      class: 'btn btn-sm',
      type: 'button',
      disabled: !ttsOk,
      on: {
        click: () => {
          if (testing) {
            safeCall(() => testing.cancel());
            testing = null;
            safeCall(stopSpeaking);
            return;
          }
          const st = getSettings();
          const hour = new Date().getHours();
          const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
          try {
            testing = speak(`Good ${part}, ${st.userName || 'sir'}. All systems are operational.`, {
              voiceURI: st.voiceURI,
              rate: st.voiceRate,
              onEnd: () => {
                testing = null;
              },
            });
          } catch (err) {
            console.error('[jarvis] speak failed:', err);
            o.toast('This browser couldn’t play speech.', { level: 'warn' });
          }
        },
      },
    },
    icon('speaker', { size: 16 }),
    h('span', { text: 'Test voice' }),
  );
  const voice = section(
    'voice',
    card(
      row({
        label: 'Speak replies',
        help: ttsOk ? 'Read Jarvis’s answers aloud: a short summary or the full reply.' : 'Spoken replies aren’t supported in this browser.',
        forId: fieldId('speakReplies'),
        control: selectField('speakReplies', [
          { value: 'off', label: 'Off' },
          { value: 'summary', label: 'Summary' },
          { value: 'full', label: 'Full reply' },
        ]),
        stacked: true,
      }),
      row({ label: 'Voice', help: 'Voices come from your device. A British butler is preferred when available.', forId: fieldId('voiceURI'), control: voiceSelect, stacked: true }),
      row({ label: 'Speaking speed', forId: fieldId('voiceRate'), control: h('div', { class: 'range-wrap' }, rate, rateOut), stacked: true, extra: h('div', { class: 'set-row-actions' }, testVoiceBtn) }),
    ),
    card(
      row({
        label: 'Listening language',
        help: sttOk ? 'The language you speak to the microphone in.' : 'Voice input isn’t supported in this browser.',
        forId: fieldId('listenLang'),
        control: selectField('listenLang', langOptions),
        stacked: true,
      }),
    ),
  );

  // Appearance & sound (SPEC §14.3)
  const themePicker = createThemePicker({
    value: s.theme,
    onChange: (id) => {
      safeCall(() => applyTheme(id)); // instant preview; app.js re-applies on the settings change too
      commit({ theme: id });
      sounds.play('tap');
    },
  });
  controls.set('theme', { set: (v) => themePicker.setValue(v) });

  const soundsOk = safeCall(() => sounds.soundsSupported(), false);
  const pct = (v) => `${Math.round(Number(v) * 100)}%`;
  const volOut = h('output', { class: 'range-out', attrs: { for: fieldId('soundVolume') } });
  const vol = h('input', {
    class: 'range',
    type: 'range',
    id: fieldId('soundVolume'),
    min: 0,
    max: 1,
    step: 0.05,
    value: String(s.soundVolume),
    disabled: !s.sounds || !soundsOk,
    attrs: { 'data-testid': 'setting-soundVolume' },
    on: {
      input: () => setText(volOut, pct(vol.value)),
      change: () => {
        const next = commit({ soundVolume: Number(vol.value) });
        vol.value = String(next.soundVolume);
        setText(volOut, pct(next.soundVolume));
        sounds.play('notify', { volume: next.soundVolume }); // hear the new level
      },
    },
  });
  setText(volOut, pct(s.soundVolume));
  const testSoundBtn = h(
    'button',
    { class: 'btn btn-sm', type: 'button', disabled: !s.sounds || !soundsOk, attrs: { 'data-testid': 'test-sound' }, on: { click: () => sounds.play('launch') } },
    icon('speaker', { size: 16 }),
    h('span', { text: 'Test sound' }),
  );
  controls.set('soundVolume', {
    set(v, st) {
      vol.value = String(v);
      vol.disabled = !st.sounds || !soundsOk;
      testSoundBtn.disabled = !st.sounds || !soundsOk;
      setText(volOut, pct(v));
    },
  });

  const notifySwitch = h('input', {
    class: 'switch',
    type: 'checkbox',
    id: fieldId('notifyOnFinish'),
    checked: s.notifyOnFinish,
    attrs: { role: 'switch', 'data-testid': 'setting-notifyOnFinish' },
    on: {
      change: async () => {
        commit({ notifyOnFinish: notifySwitch.checked });
        // The switch's change event is a user gesture: the only safe moment to ask.
        const permission = notifySwitch.checked && notifyPermission() === 'default' ? await requestNotifyPermission() : notifyPermission();
        setText(notifyHelp, explainNotifyPermission(permission));
      },
    },
  });
  controls.set('notifyOnFinish', { set: (v) => (notifySwitch.checked = !!v) });
  const notifyRow = row({ label: 'Notify when finished', help: safeCall(() => explainNotifyPermission(), ''), forId: fieldId('notifyOnFinish'), control: notifySwitch });
  const notifyHelp = notifyRow.querySelector('.set-help');
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  const appearance = section(
    'appearance',
    card(row({ label: 'Theme', help: 'Accent colors for the whole interface.', control: themePicker.el, stacked: true })),
    card(
      row({
        label: 'Sounds',
        help: soundsOk ? 'Subtle tones when you send, agents report and missions finish.' : 'Sounds aren’t supported in this browser.',
        forId: fieldId('sounds'),
        control: switchField('sounds', { label: 'Sounds' }),
      }),
      row({ label: 'Volume', forId: fieldId('soundVolume'), control: h('div', { class: 'range-wrap' }, vol, volOut), stacked: true, extra: h('div', { class: 'set-row-actions' }, testSoundBtn) }),
      row({
        label: 'Haptics',
        help: canVibrate ? 'A light buzz for launches, results and errors.' : 'This device doesn’t offer vibration to web apps (iPhone), so there is nothing to feel here.',
        forId: fieldId('haptics'),
        control: switchField('haptics', { label: 'Haptics' }),
      }),
      notifyRow,
    ),
  );

  // Location
  const location = section(
    'location',
    card(
      row({
        label: 'Your location',
        help: 'Shared with Jarvis so answers about weather, prices and events fit where you are. Leave empty to keep it private.',
        forId: fieldId('location'),
        control: textField('location', { placeholder: 'e.g. Austin, Texas, US', maxLength: 120, autocomplete: 'address-level2' }),
        stacked: true,
      }),
    ),
  );

  // Memory
  const memList = h('ul', { class: 'memory-list', attrs: { 'aria-label': 'Remembered facts' } });
  const memInput = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Add something Jarvis should remember',
    maxLength: 300,
    attrs: { 'aria-label': 'New fact', 'data-testid': 'memory-input', autocomplete: 'off' },
    on: {
      keydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addFact();
        }
      },
    },
  });
  const memAdd = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'memory-add' }, on: { click: () => addFact() } }, icon('plus', { size: 16 }), h('span', { text: 'Add' }));
  const memClear = confirmButton({
    label: 'Forget everything',
    confirmLabel: 'Tap again to forget all',
    iconName: 'trash',
    onConfirm: () => {
      clearMemory();
      o.toast('Jarvis forgot everything.', { level: 'success' });
    },
  });
  function addFact() {
    const text = memInput.value.trim();
    if (!text) return;
    const item = safeCall(() => addMemory(text), null);
    if (item) {
      memInput.value = '';
    } else {
      o.toast('Couldn’t save that fact.', { level: 'error' });
    }
  }
  function renderMemory() {
    const items = safeCall(listMemory, []);
    if (!items.length) {
      memList.replaceChildren(h('li', { class: 'memory-empty', text: 'Nothing remembered yet. Ask Jarvis to remember something, or add it here.' }));
    } else {
      memList.replaceChildren(
        ...items
          .slice()
          .reverse()
          .map((m) =>
            h(
              'li',
              { class: 'memory-row', attrs: { 'data-testid': 'memory-item', 'data-id': m.id } },
              h('span', { class: 'memory-row-icon' }, icon('memory', { size: 14 })),
              h('span', { class: 'memory-row-text', text: m.text }),
              h(
                'button',
                {
                  class: 'icon-btn icon-btn--sm',
                  type: 'button',
                  attrs: { 'aria-label': `Forget: ${m.text}`, 'data-testid': 'memory-delete', title: 'Forget' },
                  on: { click: () => removeMemory(m.id) },
                },
                icon('close', { size: 16 }),
              ),
            ),
          ),
      );
    }
    memClear.el.hidden = items.length === 0;
  }
  renderMemory();
  cleanups.push(safeCall(() => onMemoryChange(() => renderMemory()), null));
  const memory = section(
    'memory',
    card(row({ label: 'Memory', help: 'Let Jarvis remember facts and preferences you share, on this device only.', forId: fieldId('memoryEnabled'), control: switchField('memoryEnabled', { label: 'Memory' }) })),
    card(memList, h('div', { class: 'memory-add' }, memInput, memAdd), h('div', { class: 'set-row-actions' }, memClear.el)),
  );

  // API key & spending
  const keyState = h('div', { class: 'key-state' });
  const keyInput = h('input', {
    class: 'input input--mono',
    type: 'password',
    id: 'set-apikey',
    placeholder: 'sk-ant-…',
    attrs: { 'data-testid': 'apikey-input', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'API key' },
    on: {
      keydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveKey();
        }
      },
      input: () => setResult(null),
    },
  });
  const eyeBtn = h(
    'button',
    {
      class: 'icon-btn input-adorn',
      type: 'button',
      attrs: { 'aria-label': 'Show key', 'aria-pressed': 'false' },
      on: {
        click: () => {
          const show = keyInput.type === 'password';
          keyInput.type = show ? 'text' : 'password';
          eyeBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
          eyeBtn.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
          eyeBtn.replaceChildren(icon(show ? 'eye-off' : 'eye', { size: 18 }));
        },
      },
    },
    icon('eye', { size: 18 }),
  );
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', attrs: { 'data-testid': 'apikey-save' }, on: { click: () => saveKey() } }, icon('check', { size: 16 }), h('span', { text: 'Save' }));
  const testBtn = h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'apikey-test' }, on: { click: () => testKey() } }, icon('bolt', { size: 16 }), h('span', { text: 'Test' }));
  const removeBtn = h('button', { class: 'btn btn-danger-ghost', type: 'button', attrs: { 'data-testid': 'apikey-remove' }, on: { click: () => removeKey() } }, icon('trash', { size: 16 }), h('span', { text: 'Remove key' }));
  const keyResult = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'apikey-result' } });
  let busy = false;

  function setResult(res) {
    if (!res) {
      keyResult.hidden = true;
      return;
    }
    keyResult.hidden = false;
    keyResult.dataset.tone = res.tone;
    keyResult.replaceChildren(icon(res.tone === 'ok' ? 'check' : res.tone === 'busy' ? 'spinner' : 'alert', { size: 16 }), h('span', { text: res.text }));
  }

  function renderKeyState() {
    const key = safeCall(getApiKey, '');
    keyState.replaceChildren(
      h('span', { class: ['key-dot', key ? 'is-on' : 'is-off'], attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'key-state-text' }, h('strong', { text: key ? 'Key saved on this device' : 'No API key' }), h('span', { class: ['key-mask', key && 'mono'], text: key ? maskKey(key) : 'Jarvis needs your Anthropic API key to work.' })),
    );
    removeBtn.hidden = !key;
    keyInput.placeholder = key ? 'Paste a new key to replace it' : 'sk-ant-…';
    setText(saveBtn.lastChild, key ? 'Replace' : 'Save');
  }

  function describeError(err) {
    const kind = err && err.kind;
    if (kind === 'auth') return 'Anthropic rejected this key. Check that you copied all of it.';
    if (kind === 'billing') return 'The key works, but the account has no credits. Add credits in Billing.';
    if (kind === 'network') return 'Couldn’t reach Anthropic. Check your connection and try again.';
    if (kind === 'rate_limit' || kind === 'overloaded') return 'The key works, but Anthropic is busy right now.';
    if (kind === 'not_found') return 'The key works, but this account can’t use the test model.';
    return (err && err.message) || 'The test failed for an unknown reason.';
  }

  async function runTest(key) {
    busy = true;
    testBtn.disabled = true;
    saveBtn.disabled = true;
    setResult({ tone: 'busy', text: 'Testing…' });
    try {
      const res = await o.testApiKey(key);
      if (res && res.ok) setResult({ tone: 'ok', text: 'Connected — the key works.' });
      else {
        const kind = res && res.error && res.error.kind;
        const soft = kind === 'billing' || kind === 'rate_limit' || kind === 'overloaded' || kind === 'not_found';
        setResult({ tone: soft ? 'warn' : 'err', text: describeError(res && res.error) });
      }
    } catch (err) {
      setResult({ tone: 'err', text: describeError(null) });
      console.error('[jarvis] testApiKey failed:', err);
    } finally {
      busy = false;
      testBtn.disabled = false;
      saveBtn.disabled = false;
    }
  }

  function saveKey() {
    const key = keyInput.value.trim();
    if (!key) {
      setResult({ tone: 'err', text: 'Paste your API key first.' });
      keyInput.focus();
      return;
    }
    if (!looksLikeApiKey(key)) {
      setResult({ tone: 'err', text: 'That doesn’t look like an Anthropic API key. It starts with “sk-ant-”.' });
      return;
    }
    setApiKey(key);
    keyInput.value = '';
    keyInput.type = 'password';
    renderKeyState();
    o.onKeyChanged();
    o.toast('API key saved on this device.', { level: 'success' });
    runTest(key);
  }

  function testKey() {
    if (busy) return;
    const typed = keyInput.value.trim();
    const key = typed || safeCall(getApiKey, '');
    if (!key) {
      setResult({ tone: 'err', text: 'There’s no key to test. Paste one first.' });
      return;
    }
    if (typed && !looksLikeApiKey(typed)) {
      setResult({ tone: 'err', text: 'That doesn’t look like an Anthropic API key. It starts with “sk-ant-”.' });
      return;
    }
    runTest(key);
  }

  function removeKey() {
    const old = safeCall(getApiKey, '');
    if (!old) return;
    clearApiKey();
    renderKeyState();
    setResult(null);
    o.onKeyChanged();
    o.toast('API key removed from this device.', {
      level: 'info',
      action: {
        label: 'Undo',
        fn: () => {
          setApiKey(old);
          renderKeyState();
          o.onKeyChanged();
        },
      },
    });
  }
  renderKeyState();

  const spendNow = h('span', { class: 'spend-now mono' });
  const spendOf = h('span', { class: 'spend-of' });
  const spendFill = h('span', { class: 'spend-fill' });
  const spendBar = h('div', { class: 'spend-bar', attrs: { role: 'progressbar', 'aria-label': 'Spend this month versus warning', 'aria-valuemin': '0', 'aria-valuemax': '100' } }, spendFill);
  const spendTotal = h('p', { class: 'set-help mono' });
  const warnInput = h('input', {
    class: 'input input--money',
    type: 'number',
    id: fieldId('spendWarnUsd'),
    min: 0,
    step: 1,
    value: String(s.spendWarnUsd),
    attrs: { 'data-testid': 'setting-spendWarnUsd', inputmode: 'decimal' },
    on: {
      change: () => {
        const n = Number(warnInput.value);
        const next = commit({ spendWarnUsd: Number.isFinite(n) ? Math.max(0, n) : s.spendWarnUsd });
        warnInput.value = String(next.spendWarnUsd);
        renderSpend();
      },
    },
  });
  controls.set('spendWarnUsd', {
    set(v) {
      if (document.activeElement !== warnInput) warnInput.value = String(v);
      renderSpend();
    },
  });
  function renderSpend() {
    const sp = safeCall(getSpend, { monthUsd: 0, totalUsd: 0 });
    const warn = getSettings().spendWarnUsd;
    setText(spendNow, `≈ ${money(sp.monthUsd)}`);
    setText(spendOf, warn > 0 ? `of ${money(warn)} warning` : 'warning off');
    const pct = warn > 0 ? Math.min(100, (sp.monthUsd / warn) * 100) : 0;
    spendFill.style.setProperty('--pct', `${pct}%`);
    spendBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    spendBar.dataset.tone = warn > 0 && sp.monthUsd >= warn ? 'over' : pct >= 75 ? 'near' : 'ok';
    spendBar.hidden = !(warn > 0);
    setText(spendTotal, `All time on this device ≈ ${money(sp.totalUsd)}`);
  }
  renderSpend();
  cleanups.push(safeCall(() => onSpendChange(() => renderSpend()), null));

  const apikey = section(
    'apikey',
    card(
      keyState,
      h('div', { class: 'key-entry' }, h('div', { class: 'input-group' }, keyInput, eyeBtn), h('div', { class: 'key-buttons' }, saveBtn, testBtn)),
      keyResult,
      h(
        'p',
        { class: 'set-help key-privacy' },
        icon('lock', { size: 14 }),
        h('span', { text: 'Your key is stored only in this browser on this device and is sent only to api.anthropic.com. It’s never shown in full again, and never included in backups.' }),
      ),
      h('div', { class: 'link-row' }, extLink(CONSOLE.keys, 'Get a key', { class: 'link-ext' }), extLink(CONSOLE.billing, 'Billing', { class: 'link-ext' }), extLink(CONSOLE.limits, 'Spend limits', { class: 'link-ext' })),
      h('div', { class: 'set-row-actions' }, removeBtn),
    ),
    card(
      h('div', { class: 'spend-head' }, h('span', { class: 'label-caps', text: 'This month · estimate' }), h('div', { class: 'spend-figure' }, spendNow, spendOf)),
      spendBar,
      spendTotal,
      row({ label: 'Warn me above', help: 'Monthly estimate that shows a warning banner. 0 turns it off.', forId: fieldId('spendWarnUsd'), control: h('div', { class: 'money-wrap' }, h('span', { class: 'money-prefix', text: '$' }), warnInput) }),
      h('p', { class: 'set-help', text: 'Costs are estimates from token counts. For a hard cap, set a monthly spend limit in the Anthropic Console.' }),
      typeof o.openSystems === 'function'
        ? h(
            'div',
            { class: 'set-row-actions set-row-actions--start' },
            h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'open-systems' }, on: { click: () => o.openSystems() } }, icon('chip', { size: 16 }), h('span', { text: 'Systems dashboard' })),
          )
        : null,
    ),
  );

  // Data
  const fileInput = h('input', {
    type: 'file',
    class: 'visually-hidden',
    attrs: { accept: 'application/json,.json', 'aria-label': 'Choose a backup file', 'data-testid': 'import-file', tabindex: '-1' },
    on: { change: () => onFile() },
  });
  const importConfirm = h('div', { class: 'import-confirm', hidden: true });
  function onFile() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    importConfirm.hidden = false;
    importConfirm.replaceChildren(
      h('p', { class: 'set-help', text: `Merge “${file.name}” into this device? Conversations and memories are added; nothing is deleted.` }),
      h(
        'div',
        { class: 'set-row-actions' },
        h(
          'button',
          {
            class: 'btn btn-primary btn-sm',
            type: 'button',
            attrs: { 'data-testid': 'import-confirm' },
            on: {
              click: async () => {
                importConfirm.hidden = true;
                try {
                  const res = await importBackup(file);
                  const c = (res && res.conversations) || 0;
                  const m = (res && res.memory) || 0;
                  const p = (res && Number(res.protocols)) || 0;
                  const parts = [`${c} conversation${c === 1 ? '' : 's'}`, `${m} memor${m === 1 ? 'y' : 'ies'}`];
                  if (p) parts.push(`${p} protocol${p === 1 ? '' : 's'}`);
                  o.toast(`Imported ${parts.length > 2 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join(' and ')}.`, { level: 'success' });
                  o.refreshHistory();
                  renderMemory();
                } catch (err) {
                  console.error('[jarvis] import failed:', err);
                  o.toast(err && err.message ? `Import failed: ${err.message}` : 'That file isn’t a Jarvis backup.', { level: 'error' });
                } finally {
                  fileInput.value = '';
                }
              },
            },
          },
          h('span', { text: 'Import' }),
        ),
        h(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            on: {
              click: () => {
                importConfirm.hidden = true;
                fileInput.value = '';
              },
            },
          },
          h('span', { text: 'Cancel' }),
        ),
      ),
    );
  }
  async function doExport() {
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const name = `jarvis-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
      const a = h('a', { href: url, attrs: { download: name }, class: 'visually-hidden' });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 4000);
      o.toast('Backup downloaded. It doesn’t include your API key.', { level: 'success' });
    } catch (err) {
      console.error('[jarvis] export failed:', err);
      o.toast('Couldn’t create the backup.', { level: 'error' });
    }
  }
  const delAll = confirmButton({
    label: 'Delete all conversations',
    confirmLabel: 'Tap again to delete all',
    iconName: 'trash',
    testid: 'delete-all',
    onConfirm: async () => {
      try {
        await o.deleteAllConversations();
        o.toast('All conversations deleted.', { level: 'success' });
      } catch (err) {
        console.error('[jarvis] delete all failed:', err);
        o.toast('Couldn’t delete conversations.', { level: 'error' });
      }
    },
  });
  const resetBtn = confirmButton({
    label: 'Reset Jarvis',
    confirmLabel: 'Tap again to erase everything',
    iconName: 'refresh',
    testid: 'reset-app',
    onConfirm: async () => {
      try {
        await o.resetApp();
      } catch (err) {
        console.error('[jarvis] reset failed:', err);
        o.toast('Reset failed. Try again.', { level: 'error' });
      }
    },
  });
  const persistent = safeCall(isPersistent, true);
  const data = section(
    'data',
    card(
      h('p', { class: 'set-help', text: 'Everything lives on this device. A backup carries your conversations, memory, settings, custom protocols and statistics to another device; it never includes your API key or spending.' }),
      h(
        'div',
        { class: 'set-row-actions set-row-actions--start' },
        h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'export-backup' }, on: { click: () => doExport() } }, icon('download', { size: 16 }), h('span', { text: 'Export backup' })),
        h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'import-backup' }, on: { click: () => fileInput.click() } }, icon('upload', { size: 16 }), h('span', { text: 'Import backup' })),
        fileInput,
      ),
      importConfirm,
      persistent ? null : h('p', { class: 'set-help set-help--warn' }, icon('alert', { size: 14 }), h('span', { text: 'This browser isn’t saving history (private browsing or storage blocked). Conversations will be lost when you close it.' })),
    ),
    card(
      h('div', { class: 'danger-zone' }, h('div', { class: 'set-row-text' }, h('span', { class: 'set-label', text: 'Danger zone' }), h('p', { class: 'set-help', text: 'Reset erases your key, settings, memory, protocols, statistics and all conversations on this device.' })), h('div', { class: 'set-row-actions set-row-actions--start' }, delAll.el, resetBtn.el)),
    ),
  );

  // Install
  const standalone = safeCall(isStandalone, false);
  const install = section(
    'install',
    card(
      row({
        label: standalone ? 'Jarvis is installed' : 'Install Jarvis',
        help: standalone ? 'You’re using the installed app.' : 'Add Jarvis to your Home Screen or Dock for a full-screen app that opens instantly.',
        control: standalone
          ? h('span', { class: 'pill pill--ok' }, icon('check', { size: 14 }), h('span', { text: 'Installed' }))
          : h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'open-install-guide' }, on: { click: () => o.openInstallGuide() } }, icon('download', { size: 16 }), h('span', { text: 'How to install' })),
      }),
    ),
  );

  // About
  const version = metaContent('jarvis-version') || 'dev';
  const build = metaContent('jarvis-build');
  const about = section(
    'about',
    card(
      h('div', { class: 'about-head' }, h('span', { class: 'about-word', text: 'JARVIS' }), h('span', { class: 'mono about-version', text: `v${version}${build ? ` · build ${build}` : ''}` })),
      h('p', { class: 'set-help', text: 'Jarvis runs entirely in your browser. Your key, settings, memory and conversations stay on this device; requests go straight to Anthropic’s API. Costs shown are estimates.' }),
      h(
        'div',
        { class: 'set-row-actions set-row-actions--start' },
        h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'replay-onboarding' }, on: { click: () => o.replayOnboarding() } }, icon('play', { size: 14 }), h('span', { text: 'Replay introduction' })),
        o.demo ? h('a', { class: 'btn btn-sm', href: './', text: 'Leave demo' }) : h('a', { class: 'btn btn-sm', href: './?demo=1', text: 'Open demo' }),
      ),
    ),
  );

  // ---- layout -----------------------------------------------------------------------
  const navButtons = SETTINGS_SECTIONS.map((sec) =>
    h(
      'button',
      { class: 'set-nav-btn', type: 'button', attrs: { 'data-section': sec.id }, on: { click: () => scrollToSection(sec.id, true) } },
      icon(sec.icon, { size: 16 }),
      h('span', { text: sec.short || sec.label }),
    ),
  );
  const nav = h('nav', { class: 'set-nav', attrs: { 'aria-label': 'Settings sections' } }, navButtons);
  const main = h('div', { class: 'set-main' }, profile, ai, voice, appearance, location, memory, apikey, data, install, about);
  const el = h('div', { class: 'settings', attrs: { 'data-testid': 'settings-content' } }, nav, main);

  function markNav(id) {
    for (const b of navButtons) b.classList.toggle('is-active', b.dataset.section === id);
  }
  markNav('profile');

  // Highlight the section in view. A section counts once its top passes just below the
  // sticky nav; at the very end of the list the last visible section wins. Right after a
  // nav tap the tapped section stays highlighted while the smooth scroll runs.
  let scrollRoot = null;
  let navTimer = 0;
  let navLock = null; // { id, until }
  function onScroll() {
    clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      if (!scrollRoot) return;
      if (navLock && Date.now() < navLock.until) {
        markNav(navLock.id);
        return;
      }
      navLock = null;
      const rect = scrollRoot.getBoundingClientRect();
      const atEnd = scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 4;
      let current = SETTINGS_SECTIONS[0].id;
      for (const sec of SETTINGS_SECTIONS) {
        const r = sectionEls[sec.id].getBoundingClientRect();
        if (r.top <= rect.top + 100 || (atEnd && r.top < rect.bottom - 48)) current = sec.id;
      }
      markNav(current);
    }, 80);
  }

  function scrollToSection(id, smooth) {
    const target = sectionEls[id];
    if (!target) return;
    navLock = { id, until: Date.now() + 1200 };
    markNav(id);
    const navBtn = navButtons.find((b) => b.dataset.section === id);
    if (navBtn && navBtn.scrollIntoView) {
      try {
        navBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
      } catch {
        /* ignore */
      }
    }
    try {
      target.scrollIntoView({ block: 'start', behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
    } catch {
      target.scrollIntoView();
    }
  }

  // Follow changes made elsewhere (other tabs, the composer, auto-disabled features).
  cleanups.push(
    safeCall(
      () =>
        onSettingsChange((next) => {
          s = next;
          for (const [key, ctl] of controls) {
            const value = key === 'fallbacks' || key === 'compaction' ? null : next[key];
            try {
              ctl.set(value, next);
            } catch {
              /* ignore */
            }
          }
        }),
      null,
    ),
  );

  return {
    el,
    /** Attach the scroll container (the sheet body) for nav highlighting. */
    setScrollRoot(root) {
      scrollRoot = root;
      root.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => root.removeEventListener('scroll', onScroll));
    },
    scrollToSection,
    focus(testid) {
      const target = el.querySelector(`[data-testid="${testid}"]`);
      if (target) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    },
    /** Save pending text edits (call before closing). */
    flush() {
      for (const ctl of controls.values()) if (ctl.flush) ctl.flush();
    },
    destroy() {
      for (const fn of cleanups) if (typeof fn === 'function') safeCall(fn);
      for (const fn of timers) safeCall(fn);
      clearTimeout(navTimer);
      if (testing) safeCall(() => testing.cancel());
    },
  };
}

function ensureOption(select, value, label) {
  if (!value) return;
  for (const opt of select.options) if (opt.value === value) return;
  select.appendChild(h('option', { value, text: label }));
}

function safeCall(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    if (fallback === undefined) console.error('[jarvis]', err);
    return fallback;
  }
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** A button that needs a second tap within 4 s to run a destructive action. */
export function confirmButton({ label, confirmLabel, iconName, onConfirm, testid }) {
  let armed = false;
  let timer = 0;
  const text = h('span', { text: label });
  const el = h(
    'button',
    {
      class: 'btn btn-danger-ghost',
      type: 'button',
      attrs: { 'data-testid': testid || null },
      on: {
        click: () => {
          if (!armed) {
            armed = true;
            el.classList.add('is-armed');
            setText(text, confirmLabel);
            clearTimeout(timer);
            timer = setTimeout(disarm, 4000);
            return;
          }
          disarm();
          onConfirm();
        },
        blur: () => setTimeout(disarm, 150),
      },
    },
    iconName ? icon(iconName, { size: 16 }) : null,
    text,
  );
  function disarm() {
    armed = false;
    clearTimeout(timer);
    el.classList.remove('is-armed');
    setText(text, label);
  }
  return { el, disarm };
}
