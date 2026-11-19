// Speech-to-text with the Web Speech API (SPEC §9.2).
//
//   sttSupported() -> boolean
//   startListening({ lang, onPartial, onFinal, onEnd, onError }) -> { stop(), abort() }
//     onPartial(text)  live transcript so far (final + interim words)
//     onFinal(text)    the recognized utterance, at most once per session
//     onError({ code, message })   code: 'not-allowed'|'no-speech'|'network'|'aborted'|'unsupported'|'other'
//     onEnd()          exactly once, after everything else, however the session ended
//   stop() finishes listening and delivers what was heard; abort() (extension) cancels
//   without delivering anything.
//
// One utterance per session (continuous: false, interimResults: true). Callbacks never fire
// synchronously inside startListening(), so the caller always holds the handle first.

const STOP_GRACE_MS = 4000; // recognizers occasionally never send 'end' after stop()

const MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.',
  'service-not-allowed': "Speech recognition isn't allowed on this device. On iPhone, turn on Dictation (Settings → General → Keyboard) and Siri.",
  'no-speech': "I didn't hear anything. Tap the mic and try again.",
  network: 'Voice input needs an internet connection. Check your connection and try again.',
  aborted: 'Listening was stopped.',
  'audio-capture': 'No microphone was found, or another app is using it.',
  'language-not-supported': "Voice input doesn't support the selected language here. Change the listening language in Settings.",
  unsupported: "Voice input isn't supported in this browser. Try Safari on iPhone, or Chrome or Edge on Android and desktop.",
  other: 'Voice input stopped unexpectedly. Please try again.',
};

function recognitionCtor() {
  try {
    return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
  } catch {
    return null;
  }
}

export function sttSupported() {
  return typeof recognitionCtor() === 'function';
}

/** Map a SpeechRecognitionErrorEvent.error (or DOMException name) to { code, message }. */
export function mapSttError(error) {
  switch (error) {
    case 'not-allowed':
    case 'NotAllowedError':
    case 'SecurityError':
      return { code: 'not-allowed', message: MESSAGES['not-allowed'] };
    case 'service-not-allowed':
      return { code: 'not-allowed', message: MESSAGES['service-not-allowed'] };
    case 'no-speech':
      return { code: 'no-speech', message: MESSAGES['no-speech'] };
    case 'network':
      return { code: 'network', message: MESSAGES.network };
    case 'aborted':
    case 'AbortError':
      return { code: 'aborted', message: MESSAGES.aborted };
    case 'audio-capture':
      return { code: 'other', message: MESSAGES['audio-capture'] };
    case 'language-not-supported':
      return { code: 'unsupported', message: MESSAGES['language-not-supported'] };
    case 'unsupported':
      return { code: 'unsupported', message: MESSAGES.unsupported };
    default:
      return { code: 'other', message: MESSAGES.other };
  }
}

function call(fn, arg) {
  if (typeof fn !== 'function') return;
  try {
    fn(arg);
  } catch (err) {
    try {
      console.error('[jarvis] voice input callback failed:', err);
    } catch {
      /* ignore */
    }
  }
}

function defaultLang() {
  try {
    return globalThis.navigator.language || 'en-US';
  } catch {
    return 'en-US';
  }
}

export function startListening({ lang, onPartial, onFinal, onEnd, onError } = {}) {
  const Ctor = recognitionCtor();
  const state = {
    ended: false,
    errored: false,
    aborted: false, // abort() by the caller: deliver nothing
    finalSent: false,
    heard: '', // latest full transcript
    timer: 0,
    rec: null,
  };

  const finish = () => {
    if (state.ended) return;
    state.ended = true;
    clearTimeout(state.timer);
    // Some engines (notably Safari) end without ever flagging a result final: deliver what we heard.
    if (!state.finalSent && !state.aborted && !state.errored && state.heard) {
      state.finalSent = true;
      call(onFinal, state.heard);
    }
    if (state.rec) {
      state.rec.onresult = state.rec.onerror = state.rec.onend = state.rec.onnomatch = null;
    }
    call(onEnd);
  };
  const fail = (err) => {
    if (state.ended || state.errored) return;
    state.errored = true;
    call(onError, err);
  };
  const handle = {
    stop() {
      if (state.ended) return;
      try {
        state.rec && state.rec.stop();
      } catch {
        /* not started */
      }
      clearTimeout(state.timer);
      state.timer = setTimeout(finish, STOP_GRACE_MS);
    },
    abort() {
      if (state.ended) return;
      state.aborted = true;
      try {
        state.rec && state.rec.abort();
      } catch {
        /* not started */
      }
      clearTimeout(state.timer);
      state.timer = setTimeout(finish, 1000);
    },
  };

  if (typeof Ctor !== 'function') {
    setTimeout(() => {
      fail(mapSttError('unsupported'));
      finish();
    }, 0);
    return handle;
  }

  let rec;
  try {
    rec = new Ctor();
    rec.lang = typeof lang === 'string' && lang.trim() ? lang.trim() : defaultLang();
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
  } catch (err) {
    setTimeout(() => {
      fail(mapSttError(err && err.name));
      finish();
    }, 0);
    return handle;
  }
  state.rec = rec;

  rec.onresult = (event) => {
    if (state.ended || state.aborted) return;
    let finalText = '';
    let interim = '';
    const results = event.results || [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const t = r && r[0] && typeof r[0].transcript === 'string' ? r[0].transcript : '';
      if (r && r.isFinal) finalText += t;
      else interim += t;
    }
    const all = (finalText + ' ' + interim).replace(/\s+/g, ' ').trim();
    if (all && all !== state.heard) {
      state.heard = all;
      call(onPartial, all);
    }
    const done = finalText.replace(/\s+/g, ' ').trim();
    if (done && !state.finalSent) {
      state.finalSent = true;
      call(onFinal, done);
    }
  };
  rec.onnomatch = () => {
    if (!state.heard && !state.aborted) fail(mapSttError('no-speech'));
  };
  rec.onerror = (event) => {
    const code = event && event.error;
    if (code === 'aborted' && state.aborted) return; // our own abort(): not an error
    fail(mapSttError(code));
  };
  rec.onend = finish;

  // start() synchronously: iOS Safari only lets recognition begin inside the user's tap.
  // (Recognition events are always asynchronous, so the caller still gets the handle first.)
  try {
    rec.start();
  } catch (err) {
    const code = err && err.name === 'NotAllowedError' ? 'not-allowed' : 'other';
    setTimeout(() => {
      fail(mapSttError(code));
      finish();
    }, 0);
  }
  return handle;
}
