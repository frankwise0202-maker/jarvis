// Settings → Voice → "Jarvis's voice", at the top (v7.8, SPEC §26): the voice Jarvis speaks with and
// where it comes from, with Test (inside the tap, so it also unlocks audio on iOS) and the label of the
// voice that actually speaks. With a home base: George's voice from the home base, on or off (the easy
// off switch), and what it is doing (downloading, getting ready, resting). Without one: the two free ways
// to George (link the home base; or George on this device: its download, "may be slow on iPhone"). And a
// plain tip for a better built-in voice (iPhone: an Enhanced or Premium British voice; Jarvis already
// prefers those by himself, platform/voice/tts.js rankVoices).
//
//   const card = createJarvisVoiceCard({ tts, senses, natural, getSettings, commit, toast, os, goTo });
//   card.el · card.sync(settings) · card.destroy()
//
// Test ids: jarvis-voice (data-engine), jarvis-voice-tag, jarvis-voice-where, jarvis-voice-test,
// jarvis-voice-pending (data-state), jarvis-voice-homebase (row), jarvis-voice-homebase-toggle,
// jarvis-voice-offer, jarvis-voice-link, jarvis-voice-natural, jarvis-voice-natural-on, jarvis-voice-tip.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { createVoiceTag } from './voice-tag.js';
import { voiceInUse, voiceLabel, thisDevice } from '../lib/voice-choice.js';
import { setHomeBaseVoice } from './voice-auto.js';
import { sensesProblem } from '../lib/senses.js';
import { voiceById, formatMegabytes } from '../platform/voice/natural/catalog.js';

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] Jarvis’s voice card:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

/** A better built-in voice, in plain steps for this device (Jarvis prefers these by himself). */
export function betterVoiceTip(os) {
  if (os === 'ios' || os === 'ipados') {
    const dev = os === 'ipados' ? 'iPad' : 'iPhone';
    return {
      title: `A better ${dev} voice, for when George isn’t speaking (free)`,
      text: `On the ${dev}: Settings > Accessibility > Spoken Content > Voices > English > pick a British voice (for example Daniel or Arthur) > download its Enhanced or Premium version. Jarvis already prefers those automatically; close Jarvis completely and open it again afterwards.`,
    };
  }
  if (os === 'mac') {
    return {
      title: 'A better Mac voice, for when George isn’t speaking (free)',
      text: 'On the Mac: System Settings > Accessibility > Spoken Content > System voice > Manage Voices… > English (United Kingdom) > Daniel or Arthur, the Enhanced or Premium version. Jarvis already prefers those automatically; reload Jarvis afterwards.',
    };
  }
  return {
    title: 'A better built-in voice (free)',
    text: 'Add an English (United Kingdom) voice in your system’s speech or accessibility settings, ideally one marked Enhanced, Premium or Natural. Jarvis already prefers those automatically; reload Jarvis afterwards.',
  };
}

export function createJarvisVoiceCard({ tts, senses = null, natural = null, getSettings, commit, toast = () => {}, os = 'other', goTo = () => {} }) {
  const settings = () => safe(() => getSettings() || {}, {});
  const name = () => (voiceById(settings().naturalVoiceId) || voiceById('bm_george') || { name: 'George' }).name;
  const dev = thisDevice(os);
  const devShort = dev.replace(/^this /, '');
  let destroyed = false;
  let testing = null; // { cancel }
  let deviceVoice = null; // { name } the built-in voice Jarvis uses
  let busy = false;
  let naturalSize = natural && natural.plan ? formatMegabytes(natural.plan.bytes) : 'about 117 MB';
  const offs = [];

  const tag = createVoiceTag({ testid: 'jarvis-voice-tag' });
  const where = h('p', { class: 'set-help jv-where', attrs: { 'data-testid': 'jarvis-voice-where' } });
  const testLabel = h('span', { text: 'Test' });
  const testBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'jarvis-voice-test', 'aria-label': 'Test Jarvis’s voice' }, on: { click: () => onTest() } }, icon('speaker', { size: 16 }), testLabel);

  const pendingText = h('span', { class: 'jv-pending-text' });
  const pendingBar = h('progress', { class: 'nv-progress', max: 1, value: 0, hidden: true, attrs: { 'aria-label': 'George’s voice download on the home base' } });
  const pending = h('p', { class: 'jv-pending', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'jarvis-voice-pending' } }, pendingText, pendingBar);

  // With a home base: the easy off (and on) switch.
  const hbSw = h('input', { class: 'switch', type: 'checkbox', id: 'set-jarvisVoiceHomeBase', attrs: { role: 'switch', 'data-testid': 'jarvis-voice-homebase-toggle', 'aria-describedby': 'set-jarvisVoiceHomeBase-help' }, on: { change: () => onSwitch(hbSw.checked) } });
  const hbLabel = h('label', { class: 'set-label', attrs: { for: 'set-jarvisVoiceHomeBase' } });
  const hbHelp = h('p', { class: 'set-help', id: 'set-jarvisVoiceHomeBase-help' });
  const hbRow = h('div', { class: 'jv-switch-row', hidden: true, attrs: { 'data-testid': 'jarvis-voice-homebase' } }, h('div', { class: 'set-row-text' }, hbLabel, hbHelp), h('div', { class: 'set-row-control' }, hbSw));

  // Without a home base: the two free ways to George.
  const naturalHelp = h('p', { class: 'set-help' });
  const naturalBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'jarvis-voice-natural-on' }, on: { click: () => onNatural() } }, icon('download', { size: 16 }), h('span', { text: `Use George on ${dev}` }));
  const naturalRow = h('div', { class: 'jv-offer-row', attrs: { 'data-testid': 'jarvis-voice-natural' } }, h('span', { class: 'set-label', text: `George on ${dev}` }), naturalHelp, h('div', { class: 'set-row-actions set-row-actions--start' }, naturalBtn));
  const linkBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'jarvis-voice-link' }, on: { click: () => goTo('homebase') } }, icon('server', { size: 16 }), h('span', { text: 'Link your home base' }));
  const offer = h(
    'div',
    { class: 'jv-offer', hidden: true, attrs: { 'data-testid': 'jarvis-voice-offer' } },
    h('div', { class: 'jv-offer-row' }, h('span', { class: 'set-label', text: 'George from your home base (best)' }), h('p', { class: 'set-help', text: `Link your Alienware (Settings → Home base): George’s natural voice is then made there and played on ${dev}, quickly and free.` }), h('div', { class: 'set-row-actions set-row-actions--start' }, linkBtn)),
    naturalRow,
  );

  const tipInfo = betterVoiceTip(os);
  const tip = h('p', { class: 'set-help jv-tip', attrs: { 'data-testid': 'jarvis-voice-tip', 'data-platform': os } }, h('span', { class: 'jv-tip-title', text: tipInfo.title }), h('span', { text: tipInfo.text }));

  const el = h(
    'div',
    { class: 'set-card jv-card', attrs: { 'data-testid': 'jarvis-voice' } },
    h('div', { class: 'jv-head' }, h('div', { class: 'jv-now' }, h('span', { class: 'set-label', text: 'Jarvis’s voice' }), tag.el), testBtn),
    where,
    pending,
    hbRow,
    offer,
    tip,
  );

  function sensesInput() {
    if (!senses) return null;
    const st = safe(() => senses.getState(), {}) || {};
    return { phase: st.phase, view: st.senses, problem: st.problem, cooling: safe(() => senses.cooling('speak'), false), canSpeak: safe(() => senses.canSpeak(), false) };
  }

  function naturalInput() {
    if (!natural) return null;
    const st = safe(() => natural.engine.status(), {}) || {};
    return { supported: !!(natural.support && natural.support.ok), state: st.state, knownSlow: safe(() => typeof natural.engine.knownSlow === 'function' && natural.engine.knownSlow(), false) };
  }

  function render() {
    if (destroyed) return;
    const s = settings();
    const vname = name();
    const use = voiceInUse({ settings: s, senses: sensesInput(), natural: naturalInput(), device: deviceVoice, os, voiceName: vname });
    el.dataset.engine = use.engine;
    if (!testing) tag.set(use.engine, use.label);
    setText(where, use.where);
    // What is getting ready (George on the home base), with its download.
    const p = use.pending;
    pending.hidden = !p;
    if (p) {
      pending.dataset.state = p.state;
      setText(pendingText, p.text);
      pendingBar.hidden = p.state !== 'downloading';
      if (p.state === 'downloading') pendingBar.value = typeof p.progress === 'number' ? p.progress : 0;
    }
    // The home base's switch: shown while a home base is linked.
    const linked = typeof s.homeBaseUrl === 'string' && !!s.homeBaseUrl && !!senses;
    hbRow.hidden = !linked;
    setText(hbLabel, `${vname}’s voice from the home base`);
    setText(hbHelp, s.homeBaseSpeak ? `On. Made by your Alienware and played here; if it can’t be reached, Jarvis uses ${dev}’s voice.` : `Off. Turn it on to have ${vname} made by your Alienware (free, nothing leaves your home).`);
    if (!busy) hbSw.checked = !!s.homeBaseSpeak;
    // No home base: the ways to George.
    offer.hidden = linked;
    const nat = naturalInput();
    const natSupported = !!(nat && nat.supported);
    naturalRow.hidden = !natSupported;
    if (natSupported) {
      const on = s.naturalVoice === true;
      naturalBtn.hidden = on;
      setText(naturalHelp, on ? `On: ${vname} is made on ${dev} itself (its download and state are under Natural voice below). It can be slow on iPhone; then Jarvis uses the ${voiceLabel('device', { os })}.` : `Free: downloads ${naturalSize} once and runs on ${dev}. It may be slow on iPhone; then Jarvis uses the ${voiceLabel('device', { os })}.`);
    }
  }

  async function onSwitch(on) {
    if (busy || !senses) return;
    busy = true;
    hbSw.disabled = true;
    const r = await setHomeBaseVoice(senses, on, { commit });
    busy = false;
    hbSw.disabled = false;
    if (destroyed) return;
    if (on && !(r && r.ok)) {
      hbSw.checked = false;
      safe(() => toast(`Couldn’t turn it on: ${sensesProblem(r).message}`, { level: 'warn' }));
    } else if (on) safe(() => toast(`${name()}’s voice from the home base is on. The home base gets it ready; until then replies sound as before.`, { level: 'success' }));
    render();
  }

  function onNatural() {
    if (!natural) return;
    commit({ naturalVoice: true });
    safe(() => natural.persistStorage());
    safe(() => natural.engine.start().catch(() => {}));
    safe(() => tts.unlockSpeech()); // inside this tap: lets iOS play the voice
    render();
  }

  /** Test: one sentence the way replies are spoken (the router), inside the tap (unlocks iOS audio). */
  function onTest() {
    safe(() => tts.unlockSpeech());
    if (testing) {
      const t = testing;
      testing = null;
      safe(() => t.cancel());
      safe(() => tts.stopSpeaking());
      setText(testLabel, 'Test');
      render();
      return;
    }
    const s = settings();
    const hr = new Date().getHours();
    const part = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';
    const line = `Good ${part}, ${s.userName || 'sir'}. This is the voice I speak with.`;
    const me = { cancel: () => {} };
    testing = me;
    setText(testLabel, 'Stop');
    const done = () => {
      if (testing !== me) return;
      testing = null;
      setText(testLabel, 'Test');
      render();
    };
    try {
      const handle = tts.speak(line, { voiceURI: s.voiceURI, rate: s.voiceRate, onEnd: () => done() });
      me.cancel = () => handle && handle.cancel && handle.cancel();
    } catch (err) {
      console.error('[jarvis] speak failed:', err);
      done();
      safe(() => toast('This browser couldn’t play speech.', { level: 'warn' }));
    }
  }

  // The voice actually speaking (during Test: George, or this device's voice when George hands over).
  if (tts && typeof tts.onVoiceChange === 'function') {
    offs.push(
      tts.onVoiceChange((engine) => {
        if (!testing || destroyed) return;
        if (engine) tag.set(engine, voiceLabel(engine, { voiceName: name(), os }));
      }),
    );
  }
  if (senses) {
    offs.push(senses.subscribe(() => render()));
    const unwatch = safe(() => (senses.base() ? senses.watch() : null), null);
    if (unwatch) offs.push(unwatch);
  }
  if (natural && natural.engine && typeof natural.engine.subscribe === 'function') offs.push(natural.engine.subscribe(() => render()));
  if (natural && typeof natural.choosePlan === 'function' && natural.support && natural.support.ok) {
    natural
      .choosePlan()
      .then((d) => {
        const plan = typeof natural.planFor === 'function' ? natural.planFor(d === 'webgpu' ? 'webgpu' : 'wasm') : natural.plan;
        if (plan) naturalSize = formatMegabytes(plan.bytes);
        render();
      })
      .catch(() => {});
  }
  // The built-in voice Jarvis uses (the owner's choice, or his own pick).
  Promise.resolve()
    .then(() => (tts && typeof tts.getVoices === 'function' ? tts.getVoices() : []))
    .then((voices) => {
      const list = Array.isArray(voices) ? voices : [];
      const chosen = settings().voiceURI ? list.find((v) => v && v.voiceURI === settings().voiceURI) : null;
      const auto = chosen || safe(() => tts.pickDefaultVoice(tts.rankVoices(list)), null);
      if (auto && typeof auto.name === 'string') deviceVoice = { name: auto.name };
      render();
    })
    .catch(() => {});
  render();

  return {
    el,
    sync: () => render(),
    destroy() {
      destroyed = true;
      if (testing) safe(() => testing.cancel());
      testing = null;
      for (const off of offs) safe(() => typeof off === 'function' && off());
    },
  };
}
