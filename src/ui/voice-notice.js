// The notice that George's voice from the home base was turned on by itself (v7.8, SPEC §26):
//   "Jarvis now speaks with George's natural voice, made by your Alienware. Getting it ready…"
// with the download on the home base, then "ready", and an easy off switch. It follows the home base's
// state (src/ui/senses.js: watch() polls every 2 s while the voice downloads or gets ready). Shown in the
// toasts' layer; hidden while Voice Mode covers the app (CSS), and again at the next launch until the
// owner has seen "ready" (localStorage jarvis.voice.georgeNotice 'pending').
//
//   const notice = createVoiceNotice({ senses, getSettings, turnOff, test, openSettings, voiceTag, os });
//   notice.el · notice.show() · notice.hide() · notice.resume() (at launch: show again if pending)
//
// Test ids: voice-notice (data-state getting | ready | problem | off), voice-notice-text,
// voice-notice-progress, voice-notice-test, voice-notice-off, voice-notice-settings, voice-notice-close.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { createVoiceTag } from './voice-tag.js';
import { senseReady } from '../lib/senses.js';
import { homeVoicePending, voiceLabel, deviceVoiceWord } from '../lib/voice-choice.js';
import { readItem, writeItem, removeItem } from '../platform/storage.js';

export const NOTICE_KEY = 'jarvis.voice.georgeNotice';
const READY_HIDE_MS = 15000;
const OFF_HIDE_MS = 6000;

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] voice notice:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

export function createVoiceNotice({ senses, getSettings, turnOff, test, openSettings, voiceName = () => 'George', os = 'other' }) {
  const settings = () => safe(() => getSettings() || {}, {});
  const tag = createVoiceTag({ testid: 'voice-notice-tag' });
  const text = h('p', { class: 'voice-notice-text', attrs: { 'data-testid': 'voice-notice-text' } });
  const progress = h('progress', { class: 'nv-progress voice-notice-progress', max: 1, value: 0, hidden: true, attrs: { 'data-testid': 'voice-notice-progress', 'aria-label': 'George’s voice download on the home base' } });
  const testLabel = h('span', { text: 'Hear him' });
  const testBtn = h('button', { class: 'btn btn-sm btn-primary', type: 'button', hidden: true, attrs: { 'data-testid': 'voice-notice-test' }, on: { click: () => onTest() } }, icon('speaker', { size: 16 }), testLabel);
  const offBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'voice-notice-off' }, on: { click: () => onOff() } }, h('span', { text: 'Turn off' }));
  const settingsBtn = h('button', { class: 'btn btn-sm', type: 'button', hidden: true, attrs: { 'data-testid': 'voice-notice-settings' }, on: { click: () => onSettings() } }, h('span', { text: 'Settings' }));
  const closeBtn = h('button', { class: 'voice-notice-close', type: 'button', attrs: { 'aria-label': 'Dismiss', 'data-testid': 'voice-notice-close' }, on: { click: () => hide(true) } }, icon('close', { size: 16 }));
  const el = h(
    'div',
    { class: 'voice-notice', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'voice-notice' } },
    h('div', { class: 'voice-notice-head' }, tag.el, closeBtn),
    text,
    progress,
    h('div', { class: 'voice-notice-actions' }, testBtn, offBtn, settingsBtn),
  );

  let unwatch = null;
  let unsub = null;
  let hideTimer = 0;
  let state = '';
  let testing = false;
  const fallbackWord = () => deviceVoiceWord(os);

  function setState(next) {
    state = next;
    el.dataset.state = next;
  }

  function render() {
    if (el.hidden || state === 'off') return;
    const name = safe(() => voiceName(), 'George');
    tag.set('homebase', voiceLabel('homebase', { voiceName: name, os }));
    const st = safe(() => senses.getState(), {}) || {};
    const s = settings();
    if (s.homeBaseSpeak !== true) {
      hide(false); // switched off elsewhere (Settings): nothing more to say
      return;
    }
    if (senseReady(st.senses, 'speak')) {
      if (state !== 'ready') {
        setState('ready');
        setText(text, `${name}’s voice is ready. Jarvis speaks with it from now on, made by your Alienware.`);
        progress.hidden = true;
        testBtn.hidden = false;
        settingsBtn.hidden = true;
        safe(() => writeItem(NOTICE_KEY, 'done'));
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => !testing && hide(false), READY_HIDE_MS);
      }
      return;
    }
    const p = homeVoicePending({ settings: s, senses: { view: st.senses, problem: st.problem, cooling: false }, voiceName: name });
    const bad = p && (p.state === 'error' || p.state === 'nodeps' || p.state === 'old' || p.state === 'off-there');
    if (bad) {
      setState('problem');
      setText(text, `${p.text} Until then Jarvis uses the ${fallbackWord()}.`);
      progress.hidden = true;
      testBtn.hidden = true;
      settingsBtn.hidden = false;
      return;
    }
    setState('getting');
    const detail = p && p.state === 'downloading' ? ` (downloading${typeof p.progress === 'number' ? ` ${Math.round(p.progress * 100)}%` : ''}${st.senses && st.senses.speak && st.senses.speak.sizeMb ? ` of about ${st.senses.speak.sizeMb} MB` : ''}, once)` : '';
    setText(text, `Jarvis now speaks with ${name}’s natural voice, made by your Alienware. Getting it ready…${detail}`);
    const showBar = !!(p && p.state === 'downloading');
    progress.hidden = !showBar;
    if (showBar) progress.value = typeof p.progress === 'number' ? p.progress : 0;
    testBtn.hidden = true;
    settingsBtn.hidden = true;
  }

  function show() {
    clearTimeout(hideTimer);
    el.hidden = false;
    setState('');
    safe(() => writeItem(NOTICE_KEY, 'pending'));
    if (!unwatch) unwatch = safe(() => senses.watch(), null);
    if (!unsub) unsub = safe(() => senses.subscribe(() => render()), null);
    render();
  }

  function hide(byOwner) {
    clearTimeout(hideTimer);
    el.hidden = true;
    if (byOwner) safe(() => writeItem(NOTICE_KEY, 'done'));
    if (unwatch) safe(() => unwatch());
    unwatch = null;
    if (typeof unsub === 'function') safe(() => unsub());
    unsub = null;
  }

  async function onOff() {
    clearTimeout(hideTimer);
    setState('off');
    progress.hidden = true;
    testBtn.hidden = true;
    settingsBtn.hidden = true;
    offBtn.hidden = true;
    setText(text, `Off. Jarvis speaks with the ${fallbackWord()}. You can turn ${safe(() => voiceName(), 'George')} on again in Settings → Voice.`);
    tag.set('device', voiceLabel('device', { os }));
    safe(() => writeItem(NOTICE_KEY, 'done'));
    await Promise.resolve(safe(() => turnOff(), null)).catch(() => {});
    hideTimer = setTimeout(() => hide(false), OFF_HIDE_MS);
  }

  function onTest() {
    clearTimeout(hideTimer);
    testing = true;
    setText(testLabel, 'Playing…');
    Promise.resolve(safe(() => test({ onVoice: (engine, label) => engine && tag.set(engine, label) }), null))
      .catch(() => {})
      .then(() => {
        testing = false;
        setText(testLabel, 'Hear him');
        hideTimer = setTimeout(() => hide(false), READY_HIDE_MS);
      });
  }

  function onSettings() {
    hide(true);
    safe(() => openSettings());
  }

  return {
    el,
    show,
    hide: () => hide(false),
    get state() {
      return state;
    },
    /** At launch: the owner hasn't seen "ready" yet (the app was closed while George got ready). */
    resume() {
      const s = settings();
      const pending = safe(() => readItem(NOTICE_KEY), null) === 'pending';
      if (pending && s.homeBaseSpeak === true && s.homeBaseSpeakBy === 'auto') show();
      else if (pending) safe(() => removeItem(NOTICE_KEY));
    },
  };
}
