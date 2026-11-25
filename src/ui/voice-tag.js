// The voice label (v7.8, SPEC §26): a small pill naming the voice that is actually speaking —
// "George · home base", "George · this device", "iPhone voice" or "built-in voice" — wherever Jarvis
// speaks (Voice Mode and its wake routine, a reply read aloud in the chat, Settings' Test). Presence
// style: monospace capitals on a hairline, a steady dot coloured by the voice (never blinking). When the
// voice changes mid-reply (George handing over to this device) the pill brightens once, calmly.
//
//   const tag = createVoiceTag({ testid, className });
//   tag.set(engine, label)   engine 'homebase' | 'natural' | 'device' | null (null hides it)
//   tag.el

import { h, setText } from './dom.js';

const TITLES = {
  homebase: 'George’s natural voice, made by your home base',
  natural: 'The natural voice, made on this device',
  device: 'This device’s own voice',
};

export function createVoiceTag({ testid = 'voice-tag', className = '' } = {}) {
  const dot = h('span', { class: 'voice-tag-dot', attrs: { 'aria-hidden': 'true' } });
  const text = h('span', { class: 'voice-tag-text' });
  const el = h('span', { class: `voice-tag${className ? ` ${className}` : ''}`, hidden: true, attrs: { 'data-testid': testid } }, dot, text);
  let shown = null;
  let label = '';
  return {
    el,
    get engine() {
      return shown;
    },
    get label() {
      return label;
    },
    set(engine, words) {
      if (!engine || !words) {
        el.hidden = true;
        delete el.dataset.engine;
        el.classList.remove('is-changed');
        shown = null;
        label = '';
        return;
      }
      const changed = shown !== null && shown !== engine; // George handed over mid-reply
      el.hidden = false;
      el.dataset.engine = engine;
      el.title = TITLES[engine] || '';
      el.setAttribute('aria-label', `Voice: ${words.replace(' · ', ', ')}`);
      if (label !== words) setText(text, words);
      label = words;
      if (changed) {
        el.classList.remove('is-changed');
        void el.offsetWidth; // restart the one-time brightening
        el.classList.add('is-changed');
      }
      shown = engine;
    },
  };
}
