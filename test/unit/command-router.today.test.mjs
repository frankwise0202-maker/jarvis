// v8.1 Phase 0: the command router, with today's matchers and TODAY_ORDER, picks exactly what each
// of today's four routing chains picked: Voice Mode's heard(), the chat box, a hologram's command
// field and Optics' field and microphone. Each chain is written out below as v8.0 had it (the same
// pure matchers its code called), and the router must agree with it on every sentence, every pair
// of readings and every state here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, registerTodayCommands, emptyState, REOPEN_ACTIONS, TODAY_ORDER } from '../../src/lib/command-router.js';
import { matchScreenCommand } from '../../src/lib/screen-commands.js';
import { matchMusicCommand } from '../../src/lib/music-commands.js';
import { matchHomeBaseCommand } from '../../src/lib/homebase.js';
import { matchBrainCommand } from '../../src/lib/brain.js';
import { standbyCommand } from '../../src/lib/wake/phrases.js';
import { matchHologramCommand, commandNeedingPart, normalizeCommandText } from '../../src/lib/hologram-commands.js';
import { matchOpticsCommand, voiceCameraRequest, voiceLiveViewRequest } from '../../src/lib/optics-commands.js';
import { confirmReply } from '../../src/ui/voice-visuals.js';
import { namesPart } from '../../src/ui/voice-heard.js';

// ---- today's chains (v8.0) ---------------------------------------------------------------------

/** voice-mode.js heard() (v7.8.1 :2780-2846) with app.js's deps: [id, reading] or null (a turn). */
function todayVoice(readings, s) {
  // "Jarvis, standby" / "go to sleep": any reading.
  const sleepWords = s.standby.available ? readings.find((r) => standbyCommand(r)) : null;
  if (sleepWords) return ['standby', sleepWords];
  // "Shall I draw a blueprint of …?": yes or no in any reading.
  const asked = s.questions[0];
  if (asked) {
    for (const words of readings) if (asked.match(words, readings)) return ['question', words];
  }
  // Said while a hologram of the reply builds.
  if (s.replying) return ['reply-building', readings[0]];
  for (const [i, words] of readings.entries()) {
    if (matchScreenCommand(words)) return ['screens', words];
    // homeBase.command = app.js homeBaseFromVoice: the home base's own words, else its brain's.
    if (s.homebase.available && matchHomeBaseCommand(words)) return ['homebase', words];
    if (s.homebase.available && s.homebase.linked && matchBrainCommand(words)) return ['brain', words];
    if (i === 0 && matchMusicCommand(words)) return ['music', words];
    const viewer = viewerStep(words, s);
    if (viewer) return [viewer, words];
  }
  if (readings.length > 1 && !namesPart(readings[0], s.partNames || [])) {
    for (const words of readings.slice(1)) if (matchMusicCommand(words)) return ['music', words];
  }
  return null;
}

/**
 * app.js voiceVisuals.command: Optics on top (optics.command), else voiceCommand (a blueprint sheet's
 * close words, the hologram's commands, or the hologram shown last opened again), else camera words
 * with Optics closed (voiceLookRequest).
 */
function viewerStep(words, s) {
  const opticsOpen = !!(s.optics && s.optics.open);
  if (opticsOpen && !s.hologram && !s.blueprintOpen) return matchOpticsCommand(words, { frozen: s.optics.mode === 'frozen' }) ? 'optics' : null;
  if (s.blueprintOpen) {
    const cmd = matchHologramCommand(words, [], {});
    const back = /^(?:go )?back$/.test(normalizeCommandText(words));
    if ((cmd && (cmd.action === 'close' || cmd.action === 'close-blueprint')) || back) return 'blueprint';
  }
  if (s.hologram) {
    if (matchHologramCommand(words, s.hologram.parts, { selected: s.hologram.selected }) || commandNeedingPart(words)) return 'hologram';
  } else if (!s.blueprintOpen && s.reply.hologram) {
    const cmd = matchHologramCommand(words, s.reply.hologram.parts, {});
    if (cmd && REOPEN_ACTIONS.has(cmd.action)) return 'hologram';
  }
  if (!opticsOpen && s.camera.supported) {
    if (voiceLiveViewRequest(words, { cameraAllowed: s.camera.allowed, ios: s.camera.ios })) return 'camera';
    if (voiceCameraRequest(words, { viewerOpen: !!(s.hologram || s.blueprintOpen), cameraAllowed: s.camera.allowed, ios: s.camera.ios })) return 'camera';
  }
  return null;
}

/** app.js's composer onCommand (v7.8.1 :568). */
function todayChat(text, s) {
  if (matchScreenCommand(text)) return 'screens';
  if (matchMusicCommand(text)) return 'music';
  if (s.standby.available && standbyCommand(text)) return 'standby';
  if (s.homebase.available && matchHomeBaseCommand(text)) return 'homebase';
  if (s.homebase.available && s.homebase.linked && matchBrainCommand(text)) return 'brain';
  return null;
}

/** viewer.js submit (v7.8.1 :1532-1536, its command() :1468-1530), then app.js sendFromViewer. */
function todayHologram(text, s) {
  if (matchHologramCommand(text, s.hologram.parts, { selected: s.hologram.selected }) || commandNeedingPart(text)) return 'hologram';
  if (matchScreenCommand(text.trim())) return 'screens';
  if (!s.voiceOpen && matchMusicCommand(text.trim())) return 'music';
  return null;
}

/** optics.js: its field (onAskKey, v8.0's typed live view words) and its own microphone. */
function todayOptics(text, s) {
  if (matchScreenCommand(text)) return 'screens';
  const cmd = matchOpticsCommand(text, { frozen: s.optics.mode === 'frozen' });
  if (!cmd) return null;
  if (s.via === 'typed' && !(cmd.action === 'liveview' || (cmd.action === 'watch' && !cmd.on))) return null;
  return 'optics';
}

// ---- the words and the states ------------------------------------------------------------------

const SENTENCES = [
  // Screens
  'put it on my other screen', 'float it', 'bring it back', 'put the camera on my other screen', 'open this in a window',
  'close the window', 'show it here', 'put mission control on screen 2', 'expand this in a different window',
  'bring everything back', 'open that in a new tab', 'put the hologram in a window',
  // Standby
  'standby', 'Jarvis, standby', 'go to sleep', 'go back to sleep', 'good night',
  // the home base and its brain
  "how's the home base?", 'home base status', 'brief me', 'research the best laptops in the background',
  'what did the home base find?', 'watch for a price drop on the iPhone',
  // Apple Music
  'play Back in Black', 'play some AC/DC', 'stop the music', 'play a preview of Thunderstruck', 'clay Back in Black',
  // Optics
  'what am I looking at?', 'what is this?', 'flip', 'switch cameras', 'close the camera', 'go live', 'tell me more',
  "what's this part?", 'hologram of this', 'watch this', 'stop watching', 'live view', 'stop live view', "that's enough",
  'look at this', 'look up the battery part number', 'take a look', 'is this ripe?',
  // the hologram
  'expand it', 'explode it', 'put it back together', 'show the battery', 'isolate the fan', 'isolate it', 'zoom in',
  'rotate', 'stop rotating', 'labels off', 'front view', 'back', 'go back', 'close the blueprint', 'blueprint the battery',
  '2D', 'photos of the keyboard', 'show everything', 'close', 'close it', 'reset the view', 'the battery', 'stop',
  // a blueprint sheet
  'back to the hologram', 'hide the drawing',
  // camera words with Optics closed
  'what am I holding?', 'see this', 'do you see this', 'keep watching', 'watch me',
  // answers
  'yes', 'yes please', 'no', 'sure', 'go ahead', 'no thanks',
  // ordinary sentences
  "what's the weather tomorrow", 'tell me a joke', 'how do I open a new window in Chrome', 'search for flights to Denver',
  'show me a hologram of a jet engine', 'what is inside an AA battery', 'next', 'repeat that', 'new chat', 'open optics',
  'pull this up in Chrome', 'what does the fan do', 'open the camera', 'look at my screen',
];

// Pairs of readings (best, alternative): every short command against a few others, both ways.
const PAIR_WORDS = [
  'play Back in Black', 'clay Back in Black', 'standby', 'yes', 'no', 'float it', 'expand it', 'what am I looking at?',
  'tell me a joke', 'show the battery', 'brief me', "how's the home base?", 'flip', 'live view', 'close', 'go back',
  'the battery', 'what is this?', 'stop the music', 'put it on my other screen',
];

const PARTS = [
  { id: 'battery', name: 'Battery', aka: [] },
  { id: 'fan', name: 'Fan', aka: ['cooling fan'] },
  { id: 'keyboard', name: 'Keyboard', aka: [] },
  { id: 'display', name: 'Display lid', aka: ['screen', 'display'] },
  { id: 'webcam', name: 'Webcam', aka: ['camera'] },
  { id: 'hinges', name: 'Hinges', aka: [] },
  { id: 'bottom-cover', name: 'Bottom cover', aka: [] },
];

const blueprintQuestion = { id: 'blueprint', keep: false, check: false, match: (text) => { const r = confirmReply(text); return r === 'yes' || r === 'no' ? r : null; } };
const live = { open: true, mode: 'live', liveView: false, card: null, cameraAllowed: 'granted', sceneChanged: null };
const holo = (selected = null) => ({ open: true, inWindow: false, parts: PARTS, selected });

function voiceState(over = {}) {
  return {
    ...emptyState('voice'),
    standby: { available: true, open: false },
    homebase: { available: true, linked: true },
    camera: { supported: true, allowed: 'granted', ios: false },
    voiceOpen: true,
    ...over,
  };
}

const VOICE_STATES = {
  nothing: voiceState(),
  'no standby': voiceState({ standby: { available: false, open: false } }),
  'no home base': voiceState({ homebase: { available: false, linked: false } }),
  'home base, no brain': voiceState({ homebase: { available: true, linked: false } }),
  'a question': voiceState({ questions: [blueprintQuestion] }),
  replying: voiceState({ replying: true }),
  'a question while replying': voiceState({ questions: [blueprintQuestion], replying: true }),
  'optics live': voiceState({ optics: live }),
  'optics frozen': voiceState({ optics: { ...live, mode: 'frozen' } }),
  'optics under a hologram': voiceState({ optics: live, hologram: holo() }),
  'optics under a blueprint': voiceState({ optics: live, blueprintOpen: true }),
  hologram: voiceState({ hologram: holo() }),
  'hologram, battery selected': voiceState({ hologram: holo('battery') }),
  'a blueprint': voiceState({ blueprintOpen: true }),
  'a blueprint over the hologram': voiceState({ blueprintOpen: true, hologram: holo() }),
  'the last hologram': voiceState({ reply: { links: [], hologram: { title: 'Laptop', parts: PARTS } } }),
  'the last hologram under a blueprint': voiceState({ blueprintOpen: true, reply: { links: [], hologram: { title: 'Laptop', parts: PARTS } } }),
  'no camera': voiceState({ camera: { supported: false, allowed: 'unknown', ios: false } }),
  'camera not allowed yet': voiceState({ camera: { supported: true, allowed: 'prompt', ios: false } }),
  iphone: voiceState({ camera: { supported: true, allowed: 'granted', ios: true } }),
};

function router() {
  const r = createRouter({ order: TODAY_ORDER });
  registerTodayCommands(r);
  return r;
}

/** The router's pick in a Voice Mode state, with bestNamesPart as Voice Mode computes it. */
function routedVoice(r, readings, s) {
  const parts = s.hologram ? s.hologram.parts.flatMap((p) => [p.name, ...p.aka]) : [];
  const st = { ...s, bestNamesPart: namesPart(readings[0], parts) };
  const hit = r.route(readings, st);
  return hit ? [hit.id, hit.reading] : null;
}

function expectedVoice(readings, s) {
  const parts = s.hologram ? s.hologram.parts.flatMap((p) => [p.name, ...p.aka]) : [];
  return todayVoice(readings, { ...s, partNames: parts });
}

// ---- the proofs ---------------------------------------------------------------------------------

test('Voice Mode: the router picks what heard() picked, for every sentence in every state', () => {
  const r = router();
  let checked = 0;
  for (const [name, s] of Object.entries(VOICE_STATES)) {
    for (const words of SENTENCES) {
      assert.deepEqual(routedVoice(r, [words], s), expectedVoice([words], s), `${name}: "${words}"`);
      checked += 1;
    }
  }
  assert.ok(checked > 1500);
});

test('Voice Mode: the same for two readings (the best first), as heard() went through them', () => {
  const r = router();
  for (const [name, s] of Object.entries(VOICE_STATES)) {
    for (const best of PAIR_WORDS) {
      for (const alt of PAIR_WORDS) {
        if (alt === best) continue;
        assert.deepEqual(routedVoice(r, [best, alt], s), expectedVoice([best, alt], s), `${name}: "${best}" / "${alt}"`);
      }
    }
  }
});

test('Voice Mode: three readings, and an alternative that names a hologram part keeps Apple Music to the best', () => {
  const r = router();
  const cases = [
    ['tell me a joke', 'clay Back in Black', 'play Back in Black'],
    ['the battery', 'play Back in Black', 'standby'],
    ['what does the fan do', 'play the fan', 'play Back in Black'],
    ['yes', 'no', 'play Back in Black'],
    ['look at the keyboard', 'play Back in Black', 'expand it'],
  ];
  for (const [name, s] of Object.entries(VOICE_STATES)) {
    for (const readings of cases) assert.deepEqual(routedVoice(r, readings, s), expectedVoice(readings, s), `${name}: ${readings.join(' / ')}`);
  }
});

test('the chat box: the router picks what its onCommand picked', () => {
  const r = router();
  const states = {
    chat: { ...emptyState('chat'), via: 'typed', standby: { available: true, open: false }, homebase: { available: true, linked: true } },
    'chat, no standby': { ...emptyState('chat'), via: 'typed', homebase: { available: true, linked: true } },
    'chat, no home base': { ...emptyState('chat'), via: 'typed', standby: { available: true, open: false } },
    'chat, home base without its brain': { ...emptyState('chat'), via: 'typed', standby: { available: true, open: false }, homebase: { available: true, linked: false } },
    // Optics or a hologram open change nothing in the chat (no viewer words there today).
    'chat with optics and a hologram': { ...emptyState('chat'), via: 'typed', standby: { available: true, open: false }, optics: live, hologram: holo() },
  };
  for (const [name, s] of Object.entries(states)) {
    for (const words of SENTENCES) {
      const hit = r.route([words], s);
      assert.equal(hit ? hit.id : null, todayChat(words, s), `${name}: "${words}"`);
    }
  }
});

test("a hologram's command field: the router picks what submit() and sendFromViewer picked", () => {
  const r = router();
  const states = {
    field: { ...emptyState('hologram'), via: 'typed', hologram: holo() },
    'field, battery selected': { ...emptyState('hologram'), via: 'typed', hologram: holo('battery') },
    'its microphone': { ...emptyState('hologram'), via: 'voice', hologram: holo() },
    'over Voice Mode (no Apple Music)': { ...emptyState('hologram'), via: 'typed', hologram: holo(), voiceOpen: true },
  };
  for (const [name, s] of Object.entries(states)) {
    for (const words of SENTENCES) {
      const hit = r.route([words], s);
      assert.equal(hit ? hit.id : null, todayHologram(words, s), `${name}: "${words}"`);
    }
  }
});

test("Optics' field and microphone: the router picks what onAskKey and the microphone picked", () => {
  const r = router();
  const states = {
    'field, live': { ...emptyState('optics'), via: 'typed', optics: live },
    'field, frozen': { ...emptyState('optics'), via: 'typed', optics: { ...live, mode: 'frozen' } },
    'microphone, live': { ...emptyState('optics'), via: 'voice', optics: live },
    'microphone, frozen': { ...emptyState('optics'), via: 'voice', optics: { ...live, mode: 'frozen' } },
  };
  for (const [name, s] of Object.entries(states)) {
    for (const words of SENTENCES) {
      const hit = r.route([words], s);
      assert.equal(hit ? hit.id : null, todayOptics(words, s), `${name}: "${words}"`);
    }
  }
});

test("when a surface can't act on its pick, the next one in today's order gets the words", () => {
  const r = router();
  // "close" with a blueprint over the hologram: the sheet's close words first; if the sheet can't
  // (it closed meanwhile), the hologram's own "close"; the chat's "stop the music": music, then nothing.
  const s = VOICE_STATES['a blueprint over the hologram'];
  const first = r.route(['close'], s);
  assert.equal(first.id, 'blueprint');
  const next = r.route(['close'], s, { after: first });
  assert.equal(next.id, 'hologram');
  assert.equal(r.route(['close'], s, { after: next }), null);
  // Two readings: what follows the first pick goes on through the readings, as heard()'s loop did.
  const two = r.route(['float it', 'expand it'], VOICE_STATES.hologram);
  assert.deepEqual([two.id, two.reading], ['screens', 'float it']);
  const then = r.route(['float it', 'expand it'], VOICE_STATES.hologram, { after: two });
  assert.deepEqual([then.id, then.reading], ['hologram', 'expand it']);
});

test("today's order: the surfaces' matchers, pass by pass", () => {
  const r = router();
  assert.deepEqual(r.order('voice'), [['standby'], ['prompt', 'question'], ['reply-building'], ['screens', 'homebase', 'brain', 'music', 'optics', 'blueprint', 'hologram', 'camera'], ['music']]);
  assert.deepEqual(r.order('chat'), [['screens', 'music', 'standby', 'homebase', 'brain']]);
  assert.deepEqual(r.order('hologram'), [['hologram', 'screens', 'music']]);
  assert.deepEqual(r.order('optics'), [['screens', 'optics']]);
});
