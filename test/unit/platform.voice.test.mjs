// Unit tests for voice output (tts.js) and input (stt.js), SPEC §9.2, in real Chromium.
// Pure helpers are tested directly; speak()/startListening() run against scripted fakes of
// speechSynthesis and SpeechRecognition installed before any page script.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './platform.harness.test.mjs';

let h;
let page; // shared page for the pure functions

before(async () => {
  h = await createHarness({ tts: 'src/platform/voice/tts.js', stt: 'src/platform/voice/stt.js' });
  page = await h.newPage();
});

after(async () => {
  if (h) await h.close();
});

// ---- toSpeech / chunking ----------------------------------------------------------------

test('toSpeech summary: first paragraph only, plain text, about 400 characters at most', async () => {
  const r = await page.evaluate(() => {
    const { toSpeech } = window.__mods.tts;
    const longPara = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} explains one more detail about the result.`).join(' ');
    return {
      basic: toSpeech('# Battery outlook\n\nSolid-state cells are **two to three years** away, sir; see [Reuters](https://reuters.com/x).\n\n## Details\n\n- point one\n- point two', 'summary'),
      long: toSpeech(longPara + '\n\nSecond paragraph.', 'summary'),
      noStops: toSpeech('word '.repeat(150), 'summary'),
      listOnly: toSpeech('- **Alpha** first\n- Beta', 'summary'),
      off: toSpeech('Anything', 'off'),
      empty: toSpeech('', 'summary'),
    };
  });
  assert.equal(r.basic, 'Solid-state cells are two to three years away, sir; see Reuters.');
  assert.ok(r.long.length <= 400 && r.long.length > 300, `length ${r.long.length}`);
  assert.ok(r.long.endsWith('result.'));
  assert.ok(!r.long.includes('Second paragraph'));
  assert.ok(r.noStops.length <= 400 && r.noStops.endsWith('…'));
  assert.equal(r.listOnly, 'Alpha first. Beta.');
  assert.equal(r.off, '');
  assert.equal(r.empty, '');
});

test('toSpeech full: all prose, one line per block, no code blocks, URLs reduced to host names, no Markdown syntax', async () => {
  const text = await page.evaluate(() =>
    window.__mods.tts.toSpeech(
      '## Summary\n\nPrices fell **12%** → see https://www.example.com/report?x=1 and [the BBC](https://bbc.co.uk/news).\n\n```python\nprint("never read aloud")\n```\n\n| Model | Price |\n|---|---|\n| Opus | $4 |\n\n> Quote here\n\n1. First step\n2. Second step',
      'full',
    ),
  );
  assert.equal(text, 'Summary.\nPrices fell 12 percent to see example.com and the BBC.\nModel, Price.\nOpus, $4.\nQuote here.\nFirst step.\nSecond step.');
});

test('splitSentences and chunkText: ≤ 220-character chunks of whole sentences, nothing lost', async () => {
  const r = await page.evaluate(() => {
    const { chunkText, splitSentences } = window.__mods.tts;
    const prose = Array.from({ length: 30 }, (_, i) => `This is sentence ${i + 1}, which costs $3.50 and says "hello" (quietly).`).join(' ');
    const longSentence = 'This single sentence keeps going, and going with clauses; it adds more and more detail: numbers, names, places, dates — and it never stops to breathe because the writer was very enthusiastic about every single aspect of the subject at hand, really';
    const giant = 'x'.repeat(700);
    return {
      sentences: splitSentences('Version 3.5 is out. "Really?" she asked! Yes… it is. e.g. this'),
      prose: chunkText(prose),
      proseNorm: prose.replace(/\s+/g, ' ').trim(),
      long: chunkText(longSentence),
      longNorm: longSentence,
      giant: chunkText(giant).map((c) => c.length),
      small: chunkText('Short one. Another short one.'),
      empty: [chunkText(''), chunkText('   '), chunkText(null)],
      custom: chunkText('One two three four five six seven eight nine ten eleven twelve.', 30),
    };
  });
  assert.deepEqual(r.sentences, ['Version 3.5 is out.', '"Really?"', 'she asked!', 'Yes…', 'it is.', 'e.g.', 'this']);
  assert.ok(r.prose.length > 1);
  for (const c of r.prose) assert.ok(c.length <= 220 && /[.)]$/.test(c), c);
  assert.equal(r.prose.join(' '), r.proseNorm);
  for (const c of r.long) assert.ok(c.length <= 220, c);
  assert.equal(r.long.join(' '), r.longNorm);
  assert.ok(r.long[0].endsWith(',') || r.long[0].endsWith(';') || r.long[0].endsWith(':') || r.long[0].endsWith('—'), r.long[0]);
  assert.deepEqual(r.giant, [220, 220, 220, 40]);
  assert.deepEqual(r.small, ['Short one. Another short one.']);
  assert.deepEqual(r.empty, [[], [], []]);
  for (const c of r.custom) assert.ok(c.length <= 30, c);
});

// ---- voice picking ----------------------------------------------------------------------

test('pickDefaultVoice prefers a British male voice, then en-GB, en-US, default, first', async () => {
  const r = await page.evaluate(() => {
    const { pickDefaultVoice } = window.__mods.tts;
    const v = (name, lang, extra = {}) => ({ name, lang, voiceURI: name, default: false, localService: true, ...extra });
    const pick = (list) => {
      const p = pickDefaultVoice(list);
      return p ? p.name : null;
    };
    return {
      mac: pick([v('Samantha', 'en-US', { default: true }), v('Karen', 'en-AU'), v('Daniel', 'en-GB')]),
      macEnhanced: pick([v('Daniel', 'en-GB'), v('Daniel (Enhanced)', 'en-GB'), v('Arthur', 'en-GB')]),
      order: pick([v('Arthur', 'en-GB'), v('Oliver', 'en-GB'), v('Daniel', 'en-GB')]),
      chrome: pick([v('Google US English', 'en-US', { localService: false }), v('Google UK English Female', 'en-GB', { localService: false }), v('Google UK English Male', 'en-GB', { localService: false })]),
      windows: pick([v('Microsoft David - English (United States)', 'en-US'), v('Microsoft Zira - English (United States)', 'en-US'), v('Microsoft Hazel - English (United Kingdom)', 'en-GB'), v('Microsoft George - English (United Kingdom)', 'en-GB')]),
      edge: pick([v('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB'), v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB')]),
      android: pick([v('English United States', 'en_US'), v('English United Kingdom', 'en_GB')]),
      notEnglishDaniel: pick([v('Daniel', 'fr-FR'), v('Kate', 'en-GB'), v('Fred', 'en-GB')]),
      gbFemaleOnly: pick([v('Kate', 'en-GB'), v('Serena', 'en-GB', { default: true })]),
      usOnly: pick([v('Samantha', 'en-US'), v('Alex', 'en-US')]),
      noEnglish: pick([v('Thomas', 'fr-FR'), v('Anna', 'de-DE', { default: true })]),
      firstOnly: pick([v('Thomas', 'fr-FR'), v('Anna', 'de-DE')]),
      empty: pick([]),
      junk: [pickDefaultVoice(null), pickDefaultVoice([null, {}, 3])],
    };
  });
  assert.deepEqual(r, {
    mac: 'Daniel',
    macEnhanced: 'Daniel (Enhanced)',
    order: 'Daniel',
    chrome: 'Google UK English Male',
    windows: 'Microsoft George - English (United Kingdom)',
    edge: 'Microsoft Ryan Online (Natural) - English (United Kingdom)',
    android: 'English United Kingdom',
    notEnglishDaniel: 'Fred',
    gbFemaleOnly: 'Serena',
    usOnly: 'Alex',
    noEnglish: 'Anna',
    firstOnly: 'Thomas',
    empty: null,
    junk: [null, null],
  });
});

test('pickDefaultVoice prefers on-device voices: online voices send the spoken text to Google/Microsoft', async () => {
  const r = await page.evaluate(() => {
    const { pickDefaultVoice, resolveVoice } = window.__mods.tts;
    const v = (name, lang, localService, extra = {}) => ({ name, lang, localService, voiceURI: name, default: false, ...extra });
    const pick = (list) => {
      const p = pickDefaultVoice(list);
      return p ? `${p.name} | ${p.localService ? 'local' : 'online'}` : null;
    };
    // Real voice lists (security review): before the fix Chrome and Edge on Windows picked an online voice.
    const chromeWindows = [
      v('Microsoft George - English (United Kingdom)', 'en-GB', true), v('Microsoft Hazel - English (United Kingdom)', 'en-GB', true),
      v('Microsoft David - English (United States)', 'en-US', true, { default: true }), v('Microsoft Zira - English (United States)', 'en-US', true),
      v('Google US English', 'en-US', false), v('Google UK English Female', 'en-GB', false), v('Google UK English Male', 'en-GB', false),
    ];
    return {
      chromeWindows: pick(chromeWindows),
      edgeWindows: pick([
        v('Microsoft George - English (United Kingdom)', 'en-GB', true),
        v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB', false), v('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB', false),
        v('Microsoft Guy Online (Natural) - English (United States)', 'en-US', false),
      ]),
      chromeMac: pick([v('Daniel', 'en-GB', true), v('Samantha', 'en-US', true, { default: true }), v('Google UK English Male', 'en-GB', false)]),
      iphone: pick([v('Daniel', 'en-GB', true), v('Samantha', 'en-US', true, { default: true })]),
      // A local American voice still beats an online British one.
      localUsOnly: pick([v('Microsoft David - English (United States)', 'en-US', true, { default: true }), v('Google UK English Male', 'en-GB', false)]),
      // No local English voice at all: fall back to the online ones (the preference order still applies).
      onlineOnly: pick([v('Google US English', 'en-US', false), v('Google UK English Male', 'en-GB', false)]),
      localNonEnglishOnly: pick([v('Thomas', 'fr-FR', true, { default: true }), v('Google UK English Male', 'en-GB', false)]),
      // A browser that does not report localService keeps the plain preference order.
      unreported: pick([v('Google US English', 'en-US', undefined), v('Google UK English Male', 'en-GB', undefined)]),
      // A voice the owner chose in Settings is honoured, online or not.
      chosenOnline: resolveVoice('Google UK English Male', chromeWindows).name,
      autoWhenMissing: resolveVoice('No Such Voice', chromeWindows).name,
    };
  });
  assert.deepEqual(r, {
    chromeWindows: 'Microsoft George - English (United Kingdom) | local',
    edgeWindows: 'Microsoft George - English (United Kingdom) | local',
    chromeMac: 'Daniel | local',
    iphone: 'Daniel | local',
    localUsOnly: 'Microsoft David - English (United States) | local',
    onlineOnly: 'Google UK English Male | online',
    localNonEnglishOnly: 'Google UK English Male | online',
    unreported: 'Google UK English Male | online',
    chosenOnline: 'Google UK English Male',
    autoWhenMissing: 'Microsoft George - English (United Kingdom)',
  });
});

// ---- speak() against a fake speechSynthesis ---------------------------------------------

const FAKE_SPEECH = () => {
  // A FIFO engine like the real one: speak() queues; utterances play back to back (about 1 ms per
  // character); cancel() empties the queue with 'interrupted' / 'canceled' errors.
  const state = { spoken: [], cancels: 0, maxQueued: 0, dropEndFor: -1, swallow: -1, voicesReady: true };
  const voices = [
    { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.samantha', default: true, localService: true },
    { name: 'Daniel', lang: 'en-GB', voiceURI: 'com.apple.daniel', default: false, localService: true },
    { name: 'Moira', lang: 'en-IE', voiceURI: 'com.apple.moira', default: false, localService: true },
  ];
  const synth = new EventTarget();
  let queue = [];
  let current = null;
  Object.defineProperty(synth, 'speaking', { get: () => !!current });
  Object.defineProperty(synth, 'pending', { get: () => queue.length > 0 });
  synth.getVoices = () => (state.voicesReady ? voices.slice() : []);
  const next = () => {
    if (current || !queue.length) return;
    const u = queue.shift();
    current = u;
    setTimeout(() => {
      if (current !== u) return;
      if (u.onstart) u.onstart({});
      if (u.onboundary) u.onboundary({ charIndex: 2, charLength: 4, name: 'word' });
      setTimeout(() => {
        if (current !== u) return;
        current = null;
        if (state.dropEndFor !== u.index && u.onend) u.onend({}); // a lost 'end': the engine still moves on
        next();
      }, 5 + u.text.length);
    }, 5);
  };
  synth.speak = (u) => {
    u.index = state.spoken.length;
    state.spoken.push({ text: u.text, voice: u.voice ? u.voice.voiceURI : null, lang: u.lang, rate: u.rate, volume: u.volume });
    if (state.swallow === u.index) return; // the engine silently drops this utterance: no events at all
    queue.push(u);
    state.maxQueued = Math.max(state.maxQueued, queue.length + (current ? 1 : 0));
    next();
  };
  synth.cancel = () => {
    state.cancels++;
    const victims = (current ? [[current, 'interrupted']] : []).concat(queue.map((u) => [u, 'canceled']));
    current = null;
    queue = [];
    for (const [u, error] of victims) setTimeout(() => u.onerror && u.onerror({ error }), 0);
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.voice = null;
      this.lang = '';
      this.rate = 1;
      this.volume = 1;
      this.pitch = 1;
    }
  };
  window.__speech = state;
};

const LONG_TEXT = Array.from({ length: 12 }, (_, i) => `Sentence ${i + 1} tells you a little more about the swarm results and what they mean.`).join(' ');

test('speak: chunks are spoken in order with the chosen voice and rate, the next one queued ahead; callbacks fire once', async () => {
  const p = await h.newPage({ init: FAKE_SPEECH });
  const r = await p.evaluate(async (text) => {
    const { speak, isSpeaking } = window.__mods.tts;
    const log = [];
    let boundaries = 0;
    let duringSpeaking = null;
    await new Promise((resolve) => {
      speak(text, {
        voiceURI: 'com.apple.moira',
        rate: 1.2,
        onStart: () => {
          log.push('start');
          duringSpeaking = isSpeaking();
        },
        onBoundary: (b) => {
          boundaries++;
          if (b.chunkIndex === 1) log.push(`boundary@${b.charIndex}`);
        },
        onEnd: (info) => {
          log.push(`end:${info.reason}`);
          resolve();
        },
      });
    });
    return { log, boundaries, duringSpeaking, after: isSpeaking(), spoken: window.__speech.spoken, maxQueued: window.__speech.maxQueued };
  }, LONG_TEXT);
  assert.ok(r.spoken.length >= 3, `chunks: ${r.spoken.length}`);
  assert.ok(r.spoken.some((s) => s.text.length > 220), 'an on-device voice gets longer chunks');
  for (const s of r.spoken) {
    assert.ok(s.text.length <= 360);
    assert.equal(s.voice, 'com.apple.moira');
    assert.equal(s.lang, 'en-IE');
    assert.equal(s.rate, 1.2);
  }
  assert.equal(r.spoken.map((s) => s.text).join(' '), LONG_TEXT);
  assert.equal(r.maxQueued, 2, 'the next chunk waits in the engine while the current one plays');
  assert.deepEqual(r.log.filter((l) => !l.startsWith('boundary')), ['start', 'end:done']);
  assert.equal(r.boundaries, r.spoken.length);
  assert.ok(r.log.includes(`boundary@${r.spoken[0].text.length + 1 + 2}`), r.log.join());
  assert.equal(r.duringSpeaking, true);
  assert.equal(r.after, false);
});

test('speak: default voice when voiceURI is empty or unknown; cancel() and a new speak() stop speech', async () => {
  const p = await h.newPage({ init: FAKE_SPEECH });
  const r = await p.evaluate(async (text) => {
    const { speak, stopSpeaking, isSpeaking } = window.__mods.tts;
    const ends = [];
    const first = speak(text, { voiceURI: 'missing-voice', onEnd: (i) => ends.push(`first:${i.reason}`) });
    await new Promise((res) => setTimeout(res, 30));
    const spokenBefore = window.__speech.spoken.length;
    first.cancel();
    first.cancel(); // idempotent
    await new Promise((res) => setTimeout(res, 50));
    const afterCancel = window.__speech.spoken.length;
    speak(text, { onEnd: (i) => ends.push(`second:${i.reason}`) });
    await new Promise((res) => setTimeout(res, 20));
    speak('Replacement.', { onEnd: (i) => ends.push(`third:${i.reason}`) });
    await new Promise((res) => setTimeout(res, 80));
    speak(text, { onEnd: (i) => ends.push(`fourth:${i.reason}`) });
    await new Promise((res) => setTimeout(res, 20));
    stopSpeaking();
    await new Promise((res) => setTimeout(res, 50));
    return { ends, voice: window.__speech.spoken[0].voice, spokenBefore, afterCancel, cancels: window.__speech.cancels, speaking: isSpeaking() };
  }, LONG_TEXT);
  assert.equal(r.voice, 'com.apple.daniel'); // unknown voiceURI -> the British default
  assert.equal(r.afterCancel, r.spokenBefore, 'no chunks after cancel()');
  assert.deepEqual(r.ends, ['first:cancelled', 'second:cancelled', 'third:done', 'fourth:cancelled']);
  assert.ok(r.cancels >= 3);
  assert.equal(r.speaking, false);
});

test('speak: a lost "end" event does not leave Jarvis stuck speaking (the next chunk or the watchdog moves on)', async () => {
  const p = await h.newPage({ init: FAKE_SPEECH });
  const r = await p.evaluate(async () => {
    const run = (text) =>
      new Promise((resolve) => {
        const t = Date.now();
        const n = window.__speech.spoken.length;
        window.__mods.tts.speak(text, { onEnd: (i) => resolve({ reason: i.reason, ms: Date.now() - t, chunks: window.__speech.spoken.length - n }) });
      });
    window.__speech.dropEndFor = 0;
    const middle = await run('First chunk is lost. '.repeat(20) + 'Second part arrives.');
    window.__speech.dropEndFor = window.__speech.spoken.length;
    const last = await run('The only chunk, and its end is lost.');
    return { middle, last };
  });
  assert.equal(r.middle.reason, 'done');
  assert.equal(r.middle.chunks, 2);
  assert.ok(r.middle.ms < 2000, `the next chunk's start settled the lost one: ${r.middle.ms} ms`);
  assert.equal(r.last.reason, 'done');
  assert.ok(r.last.ms >= 2500 && r.last.ms < 8000, `${r.last.ms} ms`);
});

test('speak: an utterance the engine silently drops before it starts is spoken again, not skipped', async () => {
  const p = await h.newPage({ init: FAKE_SPEECH });
  const r = await p.evaluate(async () => {
    window.__speech.swallow = 0; // like Chrome dropping a speak() issued right after cancel()
    const reason = await new Promise((resolve) => window.__mods.tts.speak('Opening line. '.repeat(10) + 'Closing line.', { onEnd: (i) => resolve(i.reason) }));
    return { reason, texts: window.__speech.spoken.map((s) => s.text) };
  });
  assert.equal(r.reason, 'done');
  assert.equal(r.texts[0], r.texts[1], 'the dropped first chunk was re-spoken');
  assert.ok(r.texts[r.texts.length - 1].endsWith('Closing line.'));
});

test('voices load late (voiceschanged); unlockSpeech speaks one silent empty utterance', async () => {
  const p = await h.newPage({ init: FAKE_SPEECH });
  const r = await p.evaluate(async () => {
    const { getVoices, unlockSpeech, speak } = window.__mods.tts;
    window.__speech.voicesReady = false;
    const t = Date.now();
    const pending = getVoices();
    setTimeout(() => {
      window.__speech.voicesReady = true;
      window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
    }, 50);
    const voices = await pending;
    const waited = Date.now() - t;
    unlockSpeech();
    unlockSpeech();
    const unlock = window.__speech.spoken.slice();
    // speak() before voices load waits for them, then uses the default pick.
    window.__speech.voicesReady = false;
    window.__speech.spoken.length = 0;
    const done = new Promise((resolve) => speak('Hello there.', { onEnd: resolve }));
    setTimeout(() => {
      window.__speech.voicesReady = true;
      window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
    }, 30);
    await done;
    return { names: voices.map((v) => v.name), waited, unlock, late: window.__speech.spoken[0] };
  });
  assert.deepEqual(r.names, ['Samantha', 'Daniel', 'Moira']);
  assert.ok(r.waited < 1000);
  assert.deepEqual(r.unlock, [{ text: '', voice: null, lang: '', rate: 1, volume: 0 }]);
  assert.equal(r.late.voice, 'com.apple.daniel');
});

test('without speechSynthesis: unsupported, getVoices() is empty, speak() ends asynchronously', async () => {
  const p = await h.newPage({
    init: () => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    },
  });
  const r = await p.evaluate(async () => {
    const { ttsSupported, getVoices, speak, stopSpeaking, unlockSpeech, isSpeaking } = window.__mods.tts;
    let syncEnd = false;
    const reason = await new Promise((resolve) => {
      speak('Hello', { onEnd: (i) => resolve(i.reason) });
      syncEnd = false;
    });
    stopSpeaking();
    unlockSpeech();
    return { supported: ttsSupported(), voices: await getVoices(), reason, syncEnd, speaking: isSpeaking() };
  });
  assert.deepEqual(r, { supported: false, voices: [], reason: 'unsupported', syncEnd: false, speaking: false });
});

// ---- speech recognition -----------------------------------------------------------------

const FAKE_RECOGNITION = () => {
  window.__recs = [];
  class FakeRecognition {
    constructor() {
      this.lang = '';
      this.interimResults = false;
      this.continuous = true;
      this.calls = [];
      window.__recs.push(this);
    }
    start() {
      if (window.__throwOnStart) throw new DOMException('busy', window.__throwOnStart);
      this.calls.push('start');
    }
    stop() {
      this.calls.push('stop');
    }
    abort() {
      this.calls.push('abort');
    }
  }
  delete window.SpeechRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  window.__result = (rec, items) => rec.onresult({ resultIndex: 0, results: items.map(([text, final]) => Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: final })) });
};

test('stt: a continuous recognizer; partials stream, one final once the words stop changing (Jarvis decides), then it ends once', async () => {
  const p = await h.newPage({ init: FAKE_RECOGNITION });
  const r = await p.evaluate(async () => {
    const { startListening, sttSupported } = window.__mods.stt;
    const log = [];
    const handle = startListening({
      lang: 'en-GB',
      silenceMs: 300, // (the default is 1.6 s; the node tests cover the windows)
      onPartial: (t) => log.push(`partial:${t}`),
      onFinal: (t) => log.push(`final:${t}`),
      onEnd: () => log.push('end'),
      onError: (e) => log.push(`error:${e.code}`),
    });
    const rec = window.__recs[0];
    const config = { lang: rec.lang, interim: rec.interimResults, continuous: rec.continuous, alternatives: rec.maxAlternatives, calls: rec.calls.slice(), syncLog: log.length };
    window.__result(rec, [['what is the', false]]);
    window.__result(rec, [['what is the weather', false]]);
    window.__result(rec, [['what is the weather in Austin', true]]);
    window.__result(rec, [['what is the weather in Austin', true]]); // the same words again: no change
    const before = log.slice();
    await new Promise((res) => setTimeout(res, 450));
    const calls = rec.calls.slice();
    if (rec.onend) rec.onend();
    handle.stop(); // after the end: harmless
    return { supported: sttSupported(), config, before, log, calls };
  });
  assert.equal(r.supported, true);
  assert.deepEqual(r.config, { lang: 'en-GB', interim: true, continuous: true, alternatives: 3, calls: ['start'], syncLog: 0 });
  assert.ok(!r.before.some((x) => x.startsWith('final:')), 'a final result from the browser does not end the turn by itself');
  assert.deepEqual(r.log, ['partial:what is the', 'partial:what is the weather', 'partial:what is the weather in Austin', 'final:what is the weather in Austin', 'end']);
  assert.deepEqual(r.calls, ['start', 'abort'], 'the recognizer is released once the turn is over');
});

test('stt: errors are mapped to SPEC codes with helpful messages; words heard before a failure are kept', async () => {
  const p = await h.newPage({ init: FAKE_RECOGNITION });
  const r = await p.evaluate(async () => {
    const { startListening, mapSttError } = window.__mods.stt;
    const mapped = Object.fromEntries(['not-allowed', 'service-not-allowed', 'no-speech', 'network', 'aborted', 'audio-capture', 'language-not-supported', 'bad-grammar', undefined].map((c) => [String(c), mapSttError(c).code]));
    const log = [];
    startListening({ onError: (e) => log.push([e.code, typeof e.message === 'string' && e.message.length > 10]), onEnd: () => log.push('end'), onFinal: (t) => log.push(`final:${t}`) });
    const rec = window.__recs[0];
    rec.onerror({ error: 'not-allowed' });
    rec.onerror({ error: 'network' }); // only the first error is reported
    rec.onend();
    const kept = [];
    startListening({ onError: (e) => kept.push(`error:${e.code}`), onEnd: () => kept.push('end'), onFinal: (t) => kept.push(`final:${t}`) });
    const rec2 = window.__recs[1];
    window.__result(rec2, [['partial words', false]]);
    rec2.onerror({ error: 'network' });
    if (rec2.onend) rec2.onend();
    return { mapped, log, kept };
  });
  assert.deepEqual(r.mapped, {
    'not-allowed': 'not-allowed',
    'service-not-allowed': 'not-allowed',
    'no-speech': 'no-speech',
    network: 'network',
    aborted: 'aborted',
    'audio-capture': 'other',
    'language-not-supported': 'unsupported',
    'bad-grammar': 'other',
    undefined: 'other',
  });
  assert.deepEqual(r.log, [['not-allowed', true], 'end']);
  // The connection dropped after the owner spoke: what was heard is delivered (the 2-second check shows it).
  assert.deepEqual(r.kept, ['final:partial words', 'end']);
});

test('stt: Safari-style sessions without a final flag deliver what was heard; abort() delivers nothing', async () => {
  const p = await h.newPage({ init: FAKE_RECOGNITION });
  const r = await p.evaluate(async () => {
    const { startListening } = window.__mods.stt;
    const a = [];
    const first = startListening({ onFinal: (t) => a.push(`final:${t}`), onEnd: () => a.push('end') });
    const rec1 = window.__recs[0];
    window.__result(rec1, [['remind me at five', false]]);
    first.stop();
    const stopCalls = rec1.calls.slice();
    rec1.onend();
    const b = [];
    const second = startListening({ onFinal: (t) => b.push(`final:${t}`), onEnd: () => b.push('end'), onError: (e) => b.push(`error:${e.code}`) });
    const rec2 = window.__recs[1];
    window.__result(rec2, [['never mind', false]]);
    second.abort();
    rec2.onerror({ error: 'aborted' }); // caused by our abort(): not reported
    rec2.onend();
    return { a, b, stopCalls, abortCalls: rec2.calls };
  });
  assert.deepEqual(r.a, ['final:remind me at five', 'end']);
  assert.deepEqual(r.stopCalls, ['start', 'stop']);
  assert.deepEqual(r.b, ['end']);
  assert.deepEqual(r.abortCalls, ['start', 'abort']);
});

test('stt: unsupported browsers and a failing start() report an error and end, never synchronously', async () => {
  const none = await h.newPage({
    init: () => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    },
  });
  const r1 = await none.evaluate(async () => {
    const { startListening, sttSupported } = window.__mods.stt;
    const log = [];
    const handle = startListening({ onError: (e) => log.push(e.code), onEnd: () => log.push('end') });
    const sync = log.length;
    await new Promise((res) => setTimeout(res, 20));
    return { supported: sttSupported(), sync, log, hasStop: typeof handle.stop === 'function' };
  });
  assert.deepEqual(r1, { supported: false, sync: 0, log: ['unsupported', 'end'], hasStop: true });

  const failing = await h.newPage({ init: FAKE_RECOGNITION });
  const r2 = await failing.evaluate(async () => {
    window.__throwOnStart = 'NotAllowedError';
    const log = [];
    window.__mods.stt.startListening({ onError: (e) => log.push(e.code), onEnd: () => log.push('end') });
    const sync = log.length;
    await new Promise((res) => setTimeout(res, 20));
    return { sync, log };
  });
  assert.deepEqual(r2, { sync: 0, log: ['not-allowed', 'end'] });
});
