// Scriptable fakes of the Web Speech API's speech recognition for Node unit tests (stt.js), on the
// virtual clock of platform.voice.fakeengine.test.mjs (installClock).
//
//   const clock = installClock();
//   const rec = installRecognition();          // globalThis.webkitSpeechRecognition
//   const stt = await freshStt();              // a fresh copy of src/platform/voice/stt.js
//   const h = stt.startListening({ ... });
//   rec.current.say('what is the')             // drive the newest recognizer
//   clock.advance(1600) ...
//   rec.uninstall(); clock.restore();
//
// Two speakers drive it the way real engines behave:
//   chrome(rec)  Chrome: one result per phrase; a phrase becomes final after a short pause and the
//                next phrase is a new result (results accumulate for the whole session); the
//                session stays open until stop() or abort().
//   ios(rec)     iOS Safari: ONE result whose text grows (the whole session so far), never final
//                until the session stops; the session ends by itself after a pause (the final
//                result, then 'end'); a recognizer started again reports 'no-speech' when nobody
//                speaks, and its text starts empty (it only hears what is said after it started).

let copies = 0;

/** A fresh instance of stt.js (its module state, such as "phrases not supported", starts clean). */
export async function freshStt() {
  copies += 1;
  return import(new URL(`../../src/platform/voice/stt.js?copy=${copies}`, import.meta.url).href);
}

function resultList(items) {
  const list = items.map(({ text, final = false, alts = [] }) => {
    const r = [{ transcript: text, confidence: 0.9 }, ...alts.map((a) => ({ transcript: a, confidence: 0.5 }))];
    r.isFinal = final;
    return r;
  });
  return list;
}

/**
 * Install a fake SpeechRecognition. options.phrases: the recognizer has a `phrases` attribute and
 * globalThis.SpeechRecognitionPhrase exists (Chrome's contextual biasing); options.refusePhrases:
 * a session started with phrases fails with 'phrases-not-supported'.
 */
export function installRecognition(options = {}) {
  const saved = {
    SpeechRecognition: globalThis.SpeechRecognition,
    webkitSpeechRecognition: globalThis.webkitSpeechRecognition,
    SpeechRecognitionPhrase: globalThis.SpeechRecognitionPhrase,
  };
  const ctl = {
    made: [],
    throwOnStart: null, // a DOMException name thrown by the next start() calls
    get current() {
      return ctl.made[ctl.made.length - 1] || null;
    },
    get starts() {
      return ctl.made.filter((r) => r.calls.includes('start')).length;
    },
    uninstall() {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete globalThis[k];
        else globalThis[k] = v;
      }
    },
  };

  class FakeRecognition {
    constructor() {
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this.onresult = this.onerror = this.onend = this.onnomatch = null;
      this.calls = [];
      this.ended = false;
      this.items = []; // the results list of this session
      if (options.phrases) this.phrases = [];
      ctl.made.push(this);
    }
    start() {
      if (ctl.throwOnStart) {
        const err = new Error('refused');
        err.name = ctl.throwOnStart;
        throw err;
      }
      this.calls.push('start');
      this.startedAt = Date.now();
      if (options.refusePhrases && Array.isArray(this.phrases) && this.phrases.length) {
        setTimeout(() => {
          this.error('phrases-not-supported');
          this.end();
        }, 20);
      }
    }
    stop() {
      this.calls.push('stop');
      // iOS flags its result final only now; Chrome finalizes the last phrase.
      if (this.items.length) {
        const last = this.items[this.items.length - 1];
        if (!last.final) {
          this.items[this.items.length - 1] = { ...last, final: true };
          setTimeout(() => this.emit(), 5);
        }
      }
      setTimeout(() => this.end(), 20);
    }
    abort() {
      this.calls.push('abort');
      setTimeout(() => {
        this.error('aborted');
        this.end();
      }, 5);
    }
    /** Send the results list as it is now. */
    emit() {
      if (this.ended || typeof this.onresult !== 'function') return;
      this.onresult({ resultIndex: 0, results: resultList(this.items) });
    }
    /** Replace the whole results list: [{ text, final, alts }]. */
    results(items) {
      this.items = items.map((x) => (typeof x === 'string' ? { text: x } : x));
      this.emit();
    }
    error(code) {
      if (this.ended || typeof this.onerror !== 'function') return;
      this.onerror({ error: code });
    }
    end() {
      if (this.ended) return;
      this.ended = true;
      if (typeof this.onend === 'function') this.onend({});
    }
  }
  delete globalThis.SpeechRecognition;
  globalThis.webkitSpeechRecognition = FakeRecognition;
  if (options.phrases) {
    globalThis.SpeechRecognitionPhrase = class SpeechRecognitionPhrase {
      constructor(phrase, boost = 1) {
        if (boost < 0 || boost > 10) throw new SyntaxError('boost out of range');
        this.phrase = phrase;
        this.boost = boost;
      }
    };
  } else delete globalThis.SpeechRecognitionPhrase;
  return ctl;
}

/** Chrome: phrases become results; `final` marks the last one done (a pause), the next is a new result. */
export function chrome(ctl) {
  return {
    /** Words of the current phrase so far (interim). */
    say(text, { alts = [] } = {}) {
      const rec = ctl.current;
      const items = rec.items.slice();
      if (items.length && !items[items.length - 1].final) items[items.length - 1] = { text, alts };
      else items.push({ text, alts });
      rec.results(items);
    },
    /** The current phrase is final (Chrome finalizes a phrase after a short pause). */
    finalize({ alts } = {}) {
      const rec = ctl.current;
      const items = rec.items.slice();
      if (!items.length) return;
      const last = items[items.length - 1];
      items[items.length - 1] = { ...last, final: true, alts: alts || last.alts || [] };
      rec.results(items);
    },
  };
}

/** iOS Safari: one cumulative result; the session ends after a pause; a restarted session starts empty. */
export function ios(ctl) {
  return {
    /** Everything this session has heard so far (the one result's text, not final). */
    say(text, { alts = [] } = {}) {
      ctl.current.results([{ text, alts }]);
    },
    /** iOS ends the session after a pause: the result becomes final, then 'end'. */
    pauseEnd() {
      const rec = ctl.current;
      if (rec.items.length) rec.results([{ ...rec.items[0], final: true }]);
      rec.end();
    },
    /** A restarted session that hears nobody: 'no-speech', then 'end'. */
    noSpeech() {
      const rec = ctl.current;
      rec.error('no-speech');
      rec.end();
    },
  };
}
