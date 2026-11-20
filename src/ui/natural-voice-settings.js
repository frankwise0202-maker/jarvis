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
  worker: 'The voice engine could not load. Check the connection, then try again.',
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

  const testLabel = h('span', { text: 'Test natural voice' });
  const testBtn = h('button', { class: 'btn btn-sm', type: 'button', disabled: !supported, attrs: { 'data-testid': 'natural-voice-test' }, on: { click: test } }, icon('speaker', { size: 16 }), testLabel);
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
    // A test waiting for the engine, or making its sample: the owner hears the natural voice, never
    // the built-in one in its place.
    if (testing && testing.waiting) text = `${text ? `${text} ` : ''}The test plays as soon as the natural voice is ready.`;
    else if (testing && testing.cancel && st.state === 'slow') text = `${text} Making a sample with the natural voice…`;
    setText(statusText, text);
    progress.hidden = !showProgress;
    status.hidden = !text;
    status.dataset.state = st.state;
    status.dataset.test = testing ? (testing.waiting ? 'waiting' : 'playing') : '';
    setText(testLabel, testing && testing.waiting ? 'Cancel test' : 'Test natural voice');
    testBtn.setAttribute('aria-pressed', testing ? 'true' : 'false');
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

  /**
   * Test natural voice: always the natural voice, never the built-in one in its place. Ready: the
   * sentence is spoken the way replies are. Not ready yet (starting, downloading, getting ready),
   * stopped after a while idle, or measured too slow here: the natural voice makes the whole sample
   * as soon as it can, then plays it (the status line says the test is waiting; a second tap cancels).
   * After an error it says why instead.
   */
  function test() {
    if (testing) {
      testing.cancel();
      testing = null;
      render();
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
    const st = natural.engine.status();
    if (st.state === 'error') {
      toast(`${(st.error && ERROR_TEXT[st.error.code]) || ERROR_TEXT.init} Tap Try again to hear it.`, { level: 'warn' });
      return;
    }
    if (st.state === 'ready') {
      testing = tts.speak(line, {
        voiceURI: s.voiceURI,
        rate: s.voiceRate,
        onEnd: () => {
          testing = null;
          render();
        },
      });
      render();
      return;
    }
    sample(line, s);
  }

  /** The whole sample made by the natural voice, then played (waits for the engine when needed). */
  function sample(line, s) {
    let cancelled = false;
    let job = null;
    let unsub = null;
    const me = {
      waiting: true,
      cancel: () => {
        cancelled = true;
        if (unsub) unsub();
        unsub = null;
        if (job) natural.engine.cancel([job.id]);
        natural.audio.stopAll();
      },
    };
    testing = me;
    const finish = () => {
      if (unsub) unsub();
      unsub = null;
      if (testing === me) testing = null;
      render();
    };
    const go = () => {
      if (cancelled || job) return;
      me.waiting = false;
      if (unsub) unsub();
      unsub = null;
      render();
      job = natural.engine.synth(line, { voice: s.naturalVoiceId, speed: s.voiceRate });
      job.promise.then(
        ({ pcm, sampleRate }) => {
          if (cancelled) return;
          const played = natural.audio.play(pcm, sampleRate, natural.audio.now() + 0.05);
          setTimeout(() => !cancelled && finish(), Math.ceil(played.duration * 1000) + 100);
        },
        () => {
          if (cancelled) return;
          toast('The natural voice couldn’t make the sample. Try again.', { level: 'warn' });
          finish();
        },
      );
    };
    const now = natural.engine.status();
    if (now.state === 'ready' || now.state === 'slow') {
      go();
      return;
    }
    unsub = natural.engine.subscribe((n) => {
      if (n.state === 'ready' || n.state === 'slow') go();
      else if (n.state === 'error' && !cancelled) {
        cancelled = true;
        toast(`${(n.error && ERROR_TEXT[n.error.code]) || ERROR_TEXT.init}`, { level: 'warn' });
        finish();
      }
    });
    if (now.state === 'off') natural.engine.start().catch(() => {});
    render();
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
