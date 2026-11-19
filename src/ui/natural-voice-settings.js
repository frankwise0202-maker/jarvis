// Settings → Voice → "Natural voice": opt in to the free Kokoro voice, pick it (British first),
// test it, follow the one-time download, and see why Jarvis falls back to the built-in voice.
// The download size shown before the switch is turned on is that of the engine this device will
// run: about 350 MB on the graphics chip (WebGPU), about 117 MB on the processor (WASM).
//
//   const card = createNaturalVoiceCard({ natural, tts, getSettings, commit, toast });
//   section.append(card.el); … card.destroy();
//
//   natural   platform/voice/natural/setup.js createNaturalVoice()
//   tts       the voice router (speaks the test sentence the way replies are spoken)
//   commit    settings patch writer (returns the new settings)
//
// Test ids: setting-naturalVoice (switch), setting-naturalVoiceId (select), natural-voice-status,
// natural-voice-progress, natural-voice-test, natural-voice-retry, natural-voice-remove.
// Text goes through dom.js h()/setText (textContent only).

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { VOICES, RUNTIME, voiceLabel, formatMegabytes } from '../platform/voice/natural/catalog.js';

const ERROR_TEXT = {
  wasm: 'This browser blocked the voice engine (WebAssembly), so Jarvis uses the built-in voice.',
  webgpu: 'The graphics chip could not run the voice; Jarvis uses the built-in voice.',
  network: 'The download stopped. Check the connection, then try again.',
  integrity: 'The download was damaged or changed on the way, so it was not used. Try again.',
  'blocked-host': 'The voice tried to reach a server it is not allowed to use, so it was stopped.',
  worker: 'The voice engine could not start in this browser.',
  init: 'The voice could not start.',
};

const UNSUPPORTED_TEXT = {
  'no-worker': 'Not available in this browser (no Web Workers).',
  'no-wasm': 'Not available in this browser (no WebAssembly).',
  'no-simd': 'Not available in this browser (needs WebAssembly SIMD: Safari 16.4 or later, Chrome 91 or later).',
  'no-webaudio': 'Not available in this browser (no Web Audio).',
  'no-cache-storage': 'Not available here (no offline storage; private browsing?).',
  error: 'Not available in this browser.',
};

export function createNaturalVoiceCard({ natural, tts, getSettings, commit, toast = () => {} }) {
  // The engine this device will run decides the download: shown before anything is downloaded.
  let device = null; // 'webgpu' | 'wasm', once known
  const planOf = (d) => (typeof natural.planFor === 'function' ? natural.planFor(d) : natural.plan);
  let plan = natural.plan;
  let size = formatMegabytes(plan.bytes);
  const supported = !!(natural.support && natural.support.ok);
  let downloaded = false;
  let testing = null;
  const offs = [];

  const sw = h('input', {
    class: 'switch',
    type: 'checkbox',
    id: 'set-naturalVoice',
    checked: !!getSettings().naturalVoice,
    disabled: !supported,
    attrs: { role: 'switch', 'data-testid': 'setting-naturalVoice', 'aria-describedby': 'set-naturalVoice-help set-naturalVoice-status' },
    on: { change: () => toggle(sw.checked) },
  });

  const select = h(
    'select',
    {
      class: 'select',
      id: 'set-naturalVoiceId',
      disabled: !supported,
      attrs: { 'data-testid': 'setting-naturalVoiceId' },
      on: {
        change: () => {
          commit({ naturalVoiceId: select.value });
        },
      },
    },
    ['British', 'American'].map((accent) =>
      h(
        'optgroup',
        { attrs: { label: accent } },
        VOICES.filter((v) => v.accent === accent).map((v) => h('option', { value: v.id, text: voiceLabel(v) })),
      ),
    ),
  );
  select.value = getSettings().naturalVoiceId;

  const statusText = h('span', { class: 'nv-status-text' });
  const progress = h('progress', { class: 'nv-progress', max: 1, value: 0, attrs: { 'data-testid': 'natural-voice-progress', 'aria-label': 'Natural voice download' } });
  const status = h('div', { class: 'nv-status', id: 'set-naturalVoice-status', attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'natural-voice-status' } }, statusText, progress);

  const testBtn = h('button', { class: 'btn btn-sm', type: 'button', disabled: !supported, attrs: { 'data-testid': 'natural-voice-test' }, on: { click: test } }, icon('speaker', { size: 16 }), h('span', { text: 'Test natural voice' }));
  const retryBtn = h('button', { class: 'btn btn-sm', type: 'button', hidden: true, attrs: { 'data-testid': 'natural-voice-retry' }, on: { click: retry } }, icon('refresh', { size: 16 }), h('span', { text: 'Try again' }));
  const removeBtn = h('button', { class: 'btn btn-sm', type: 'button', hidden: true, attrs: { 'data-testid': 'natural-voice-remove' }, on: { click: remove } }, icon('trash', { size: 16 }), h('span', { text: `Remove download` }));

  const helpText = () =>
    supported
      ? `A neural British voice that runs on this device${device === 'webgpu' ? '’s graphics chip (WebGPU), for speed' : ''} (Kokoro, open source, free). What it says never leaves the device. It downloads about ${size} once and keeps it for offline use. If it’s too slow, Jarvis uses the built-in voice.`
      : UNSUPPORTED_TEXT[natural.support.reason] || UNSUPPORTED_TEXT.error;
  const labelText = () => (supported && !device ? 'Natural voice (free download)' : `Natural voice (free, downloads about ${size})`);
  const labelEl = h('label', { class: 'set-label', attrs: { for: 'set-naturalVoice', 'data-testid': 'natural-voice-label' }, text: labelText() });
  const helpEl = h('p', { class: 'set-help', id: 'set-naturalVoice-help', text: helpText() });

  const el = h(
    'div',
    { class: 'set-card nv-card', attrs: { 'data-testid': 'natural-voice-card' } },
    h(
      'div',
      { class: 'set-row' },
      h('div', { class: 'set-row-text' }, labelEl, helpEl),
      h('div', { class: 'set-row-control' }, sw),
      status,
    ),
    h(
      'div',
      { class: 'set-row set-row--stacked' },
      h('div', { class: 'set-row-text' }, h('label', { class: 'set-label', attrs: { for: 'set-naturalVoiceId' }, text: 'Speaker' }), h('p', { class: 'set-help', text: 'Who speaks with the natural voice. British voices first; grades are the model makers’ own (A best). Your speaking speed applies too.' })),
      h('div', { class: 'set-row-control' }, select),
      h('div', { class: 'set-row-actions' }, testBtn, retryBtn, removeBtn),
    ),
  );

  /** The engine in use changed (WebGPU fell back to WASM): the label and help follow it. */
  function useEngine(d) {
    if (!d || d === device) return;
    device = d;
    plan = planOf(device);
    size = formatMegabytes(plan.bytes);
    setText(labelEl, labelText());
    setText(helpEl, helpText());
    el.dataset.engine = device;
  }

  function render(st = natural.engine.status()) {
    const on = !!getSettings().naturalVoice;
    if (st.plan && (st.fallback || st.state === 'ready' || st.state === 'slow')) useEngine(st.plan);
    let text = '';
    let showProgress = false;
    retryBtn.hidden = true;
    removeBtn.hidden = !(downloaded || st.state === 'ready' || st.state === 'slow');
    switch (st.state) {
      case 'starting':
        text = 'Starting the voice engine…';
        break;
      case 'downloading': {
        // The worker's own script (already loaded by now) counts too, so it adds up to the label.
        const total = (st.total || planOf(st.plan || device || 'wasm').bytes) + RUNTIME.workerBytes;
        const loaded = Math.min(total, st.loaded + RUNTIME.workerBytes);
        showProgress = true;
        progress.max = total;
        progress.value = loaded;
        const why = st.fallback === 'webgpu-slow' ? 'The graphics chip was too slow, so the standard engine is coming: ' : st.fallback === 'webgpu-failed' ? 'The graphics chip couldn’t run it, so the standard engine is coming: ' : '';
        text = `${why}Downloading ${formatMegabytes(loaded)} of ${formatMegabytes(total)}…`;
        break;
      }
      case 'loading':
        text = 'Getting the voice ready…';
        break;
      case 'warming':
        text = 'Almost ready…';
        break;
      case 'ready': {
        const r = st.rtf || st.warmupRtf;
        const speed = r ? ` · ${(1 / r).toFixed(1)}× faster than real time` : '';
        const where = st.plan === 'webgpu' ? ' on the graphics chip' : st.fallback ? ' on the processor (the graphics chip ' + (st.fallback === 'webgpu-slow' ? 'was too slow)' : 'couldn’t run it)') : '';
        text = on ? `Ready${where}. Replies use the natural voice${speed}.` : `Downloaded (${size}). Turn it on to use it.`;
        break;
      }
      case 'slow':
        text = `Too slow on this device (${st.rtf ? st.rtf.toFixed(1) : '>1'}× real time), so Jarvis uses the built-in voice.`;
        retryBtn.hidden = false;
        break;
      case 'error':
        text = (st.error && ERROR_TEXT[st.error.code]) || ERROR_TEXT.init;
        retryBtn.hidden = false;
        break;
      default:
        if (supported && on && typeof natural.engine.knownSlow === 'function' && natural.engine.knownSlow()) {
          // Measured before (kept 30 days): the built-in voice speaks, and the engine is not even started.
          const kept = typeof natural.engine.verdict === 'function' ? natural.engine.verdict() : null;
          const v = kept && Number.isFinite(kept.rtf) ? kept.rtf : null;
          text = `Too slow on this device${v ? ` (${v.toFixed(1)}× real time)` : ''}, so Jarvis uses the built-in voice.`;
          retryBtn.hidden = false;
          break;
        }
        text = !supported ? '' : downloaded ? (on ? 'Downloaded. It starts when Jarvis next speaks.' : `Downloaded (${size}). Turn it on to use it.`) : on ? 'Not downloaded yet.' : '';
    }
    setText(statusText, text);
    progress.hidden = !showProgress;
    status.hidden = !text;
    status.dataset.state = st.state;
  }

  function toggle(on) {
    commit({ naturalVoice: on });
    if (on) {
      natural.persistStorage();
      natural.engine.start().catch(() => {}); // the status line follows the download
      tts.unlockSpeech(); // inside this tap: lets iOS play the test and the replies
    } else if (testing) {
      testing.cancel();
    }
    render();
  }

  function retry() {
    natural.engine.resetVerdict();
    if (natural.engine.status().state === 'error' || natural.engine.status().state === 'off') natural.engine.start().catch(() => {});
    render();
  }

  async function remove() {
    if (testing) testing.cancel();
    commit({ naturalVoice: false });
    sw.checked = false;
    await natural.engine.clear();
    downloaded = false;
    toast('The natural voice was removed from this device.', { level: 'success' });
    render();
  }

  function test() {
    if (testing) {
      testing.cancel();
      testing = null;
      return;
    }
    const s = getSettings();
    if (!s.naturalVoice) {
      toast('Turn on the natural voice first.', { level: 'info' });
      return;
    }
    tts.unlockSpeech();
    const hour = new Date().getHours();
    const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const line = `Good ${part}, ${s.userName || 'sir'}. All systems are operational.`;
    if (natural.engine.status().state === 'slow') {
      // Replies use the device voice here, but the owner should still hear what the natural voice
      // sounds like: make the whole sample first, then play it.
      setText(statusText, 'Making a sample with the natural voice (slow on this device)…');
      let cancelled = false;
      const job = natural.engine.synth(line, { voice: s.naturalVoiceId, speed: s.voiceRate });
      testing = { cancel: () => ((cancelled = true), natural.engine.cancel([job.id]), natural.audio.stopAll()) };
      job.promise.then(
        ({ pcm, sampleRate }) => {
          if (cancelled) return;
          const h2 = natural.audio.play(pcm, sampleRate, natural.audio.now() + 0.05);
          setTimeout(() => {
            testing = null;
            render();
          }, Math.ceil(h2.duration * 1000) + 100);
        },
        () => {
          testing = null;
          render();
        },
      );
      return;
    }
    testing = tts.speak(line, {
      voiceURI: s.voiceURI,
      rate: s.voiceRate,
      onEnd: () => {
        testing = null;
        render();
      },
    });
  }

  offs.push(natural.engine.subscribe((st) => render(st)));
  natural.isDownloaded().then((yes) => {
    downloaded = yes;
    render();
  });
  if (supported && typeof natural.choosePlan === 'function') {
    natural.choosePlan().then((d) => {
      useEngine(d === 'webgpu' ? 'webgpu' : 'wasm');
      render();
    });
  } else device = 'wasm';
  render();

  return {
    el,
    sync(st) {
      sw.checked = !!st.naturalVoice;
      if (st.naturalVoiceId && select.value !== st.naturalVoiceId) select.value = st.naturalVoiceId;
      render();
    },
    destroy() {
      for (const off of offs) off();
      if (testing) testing.cancel();
    },
  };
}
