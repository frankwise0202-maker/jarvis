// App commands (src/lib/app-commands.js, v8.1 C2): the app's own words, Voice Mode's controls and
// the stop layer's "stop", each free, with one short line. Whole sentences only: the base no-steal
// corpus never matches, in any state. Plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  normalizeAppText,
  matchAppCommand,
  matchVoiceControl,
  matchStopWord,
  stopTargets,
  chromeTaskRunning,
  appCommandLine,
  spendLine,
  moneyWords,
  nextVoiceRate,
  VOICE_RATE,
  matchScreenLook,
  matchBriefing,
} from '../../src/lib/app-commands.js';
import { NOT as NO_STEAL, ALL_STATE_NAMES as NO_STEAL_STATES, stateFor } from './fixtures/voice-corpus-base.mjs';

const pick = (a) => (a ? { do: a.do, ...Object.fromEntries(Object.entries(a).filter(([k]) => !['do', 'free', 'undo', 'check', 'camera', 'mic'].includes(k))) } : null);

test('normalizeAppText: lower case, apostrophes joined, fillers off at both ends', () => {
  assert.equal(normalizeAppText("Hey Jarvis, can you open Settings for me, please?"), 'open settings');
  assert.equal(normalizeAppText("Okay Jarvis use the Mac's voice"), 'use the macs voice');
  assert.equal(normalizeAppText('  Jarvis — new chat!  '), 'new chat');
  assert.equal(normalizeAppText("Let's start a new chat"), 'start a new chat');
  assert.equal(normalizeAppText(''), '');
  assert.equal(normalizeAppText(null), '');
});

test('act: the action of contract (b), with its defaults', () => {
  assert.deepEqual({ ...act('new-chat') }, { do: 'new-chat', free: true, undo: true, check: false, camera: false, mic: false });
  assert.deepEqual({ ...act('mic-off', { mic: true }) }, { do: 'mic-off', free: true, undo: true, check: false, camera: false, mic: true });
  assert.ok(Object.isFrozen(act('x')));
});

test('new chat', () => {
  for (const s of ['new chat', 'start a new chat', 'Start a new conversation', 'Jarvis, new chat please', 'open a new chat', 'begin a fresh chat', 'clear the chat', 'I want a new chat', "let's start a new chat"]) {
    assert.deepEqual(pick(matchAppCommand(s)), { do: 'new-chat' }, s);
  }
});

test('sheets: history, settings (and a section), the library, Mission Control, the home base', () => {
  const cases = [
    ['open history', { do: 'open', sheet: 'history' }],
    ['show me my history', { do: 'open', sheet: 'history' }],
    ['show my chat history', { do: 'open', sheet: 'history' }],
    ['open my past conversations', { do: 'open', sheet: 'history' }],
    ['open settings', { do: 'open', sheet: 'settings', section: null }],
    ['Open the settings.', { do: 'open', sheet: 'settings', section: null }],
    ['open the voice settings', { do: 'open', sheet: 'settings', section: 'voice' }],
    ['open voice settings', { do: 'open', sheet: 'settings', section: 'voice' }],
    ['show me the memory settings', { do: 'open', sheet: 'settings', section: 'memory' }],
    ['open the home base settings', { do: 'open', sheet: 'settings', section: 'homebase' }],
    ['go to my api key settings', { do: 'open', sheet: 'settings', section: 'apikey' }],
    ['open the library', { do: 'open', sheet: 'library' }],
    ['open my blueprints', { do: 'open', sheet: 'library' }],
    ['show my saved holograms', { do: 'open', sheet: 'library' }],
    ['show me my saved blueprints', { do: 'open', sheet: 'library' }],
    ['show mission control', { do: 'open', sheet: 'mission' }],
    ['open mission control', { do: 'open', sheet: 'mission' }],
    ['open the home base', { do: 'open', sheet: 'homebase' }],
    ['show me the home base', { do: 'open', sheet: 'homebase' }],
    ['open the homebase dashboard', { do: 'open', sheet: 'homebase' }],
  ];
  for (const [s, want] of cases) assert.deepEqual(pick(matchAppCommand(s)), want, s);
});

test('voice settings: rate, continuous, the check, George or the device voice', () => {
  const cases = [
    ['speak slower', { do: 'voice-rate', faster: false }],
    ['talk a little faster', { do: 'voice-rate', faster: true }],
    ['speak a bit more slowly', { do: 'voice-rate', faster: false }],
    ['slow down', { do: 'voice-rate', faster: false }],
    ['speed up', { do: 'voice-rate', faster: true }],
    ['turn off continuous', { do: 'setting', key: 'voiceContinuous', value: false }],
    ['turn continuous mode on', { do: 'setting', key: 'voiceContinuous', value: true }],
    ['continuous off', { do: 'setting', key: 'voiceContinuous', value: false }],
    ['stop continuous conversation', { do: 'setting', key: 'voiceContinuous', value: false }],
    ['send right away', { do: 'setting', key: 'listenSend', value: 'now' }],
    ['send what I say immediately', { do: 'setting', key: 'listenSend', value: 'now' }],
    ['skip the check', { do: 'setting', key: 'listenSend', value: 'now' }],
    ['show me what you heard first', { do: 'setting', key: 'listenSend', value: 'show' }],
    ['turn on the two second check', { do: 'setting', key: 'listenSend', value: 'show' }],
    ['use George', { do: 'voice', which: 'george' }],
    ["switch to George's voice", { do: 'voice', which: 'george' }],
    ['use the natural voice', { do: 'voice', which: 'george' }],
    ["use the Mac's voice", { do: 'voice', which: 'device' }],
    ['use your normal voice', { do: 'voice', which: 'device' }],
    ['use the iPhone voice', { do: 'voice', which: 'device' }],
    ['turn off George', { do: 'voice', which: 'device' }],
  ];
  for (const [s, want] of cases) assert.deepEqual(pick(matchAppCommand(s)), want, s);
});

test('the spend readout: today, this month, both, the live view', () => {
  const cases = [
    ['how much have I spent today', 'today'],
    ['How much have I spent today?', 'today'],
    ['how much did I spend this month', 'month'],
    ['how much have I spent', 'both'],
    ['how much have I spent on Jarvis so far', 'both'],
    ["what's my spend today", 'today'],
    ['what have I spent this month', 'month'],
    ['how much has the live view cost', 'live'],
    ['how much has the live view cost so far', 'live'],
    ["what's the live view cost", 'live'],
  ];
  for (const [s, period] of cases) assert.deepEqual(pick(matchAppCommand(s)), { do: 'spend', period }, s);
  // About something else: a question for Jarvis.
  for (const s of ['how much have I spent on groceries this month', 'how much did I spend at the store', 'how much does the live view cost per hour in general']) {
    assert.equal(matchAppCommand(s), null, s);
  }
});

test("Voice Mode's controls: hush, read the full answer, repeat, stop listening, exit", () => {
  const cases = [
    ['stop talking', { do: 'hush' }],
    ['be quiet', { do: 'hush' }],
    ['Jarvis, be quiet.', { do: 'hush' }],
    ["that's enough", { do: 'hush' }],
    ['shh', { do: 'hush' }],
    ['read the full answer', { do: 'read-full' }],
    ['read me the rest', { do: 'read-full' }],
    ['read the whole thing', { do: 'read-full' }],
    ['keep reading', { do: 'read-full' }],
    ['read me the details', { do: 'read-full' }],
    ['repeat that', { do: 'repeat' }],
    ['say that again', { do: 'repeat' }],
    ['what did you say', { do: 'repeat' }],
    ["sorry, I didn't catch that", { do: 'repeat' }],
    ['say it again please', { do: 'repeat' }],
    ["I didn't catch that", { do: 'repeat' }],
    ['stop listening', { do: 'mic-off' }],
    ['mute the microphone', { do: 'mic-off' }],
    ['exit voice mode', { do: 'exit-voice' }],
    ['close voice mode', { do: 'exit-voice' }],
    ['leave voice', { do: 'exit-voice' }],
  ];
  for (const [s, want] of cases) assert.deepEqual(pick(matchVoiceControl(s)), want, s);
  // The microphone controls never act on another reading (R7: mic), and leaving can't be undone by voice.
  assert.equal(matchVoiceControl('stop listening').mic, true);
  assert.equal(matchVoiceControl('exit voice mode').mic, true);
  assert.equal(matchVoiceControl('exit voice mode').undo, false);
  assert.equal(matchVoiceControl('repeat that').mic, false);
});

test('the stop layer: a bare "stop" stops everything that runs; nothing running: "Okay."', () => {
  const s = (name, patch) => stateFor(name, patch);
  const running = { id: 't1', status: 'running', text: 'find a monitor' };
  assert.deepEqual(pick(matchStopWord('stop', s('V0'))), { do: 'stop', targets: [] });
  assert.deepEqual(pick(matchStopWord('Jarvis, stop!', s('T'))), { do: 'stop', targets: ['tour'] });
  assert.deepEqual(pick(matchStopWord('okay stop', s('T', { chrome: { linked: true, online: true, task: running, contextUntil: 0 } }))), { do: 'stop', targets: ['tour', 'chrome'] });
  assert.deepEqual(pick(matchStopWord('stop it', s('LV'))), { do: 'stop', targets: ['liveview'] });
  assert.deepEqual(pick(matchStopWord('stop', s('S'))), { do: 'stop', targets: ['speech'] });
  assert.deepEqual(pick(matchStopWord('stop everything', s('V0', { music: { playing: true } }))), { do: 'stop', targets: ['music'] });
  // A hologram on top with nothing running: its own "stop" (hold still) takes it.
  assert.equal(matchStopWord('stop', s('VH')), null);
  assert.equal(matchStopWord('stop', s('V0', { blueprintOpen: true })), null);
  // A finished task doesn't count.
  assert.deepEqual(pick(matchStopWord('stop', s('V0', { chrome: { linked: true, online: true, task: { id: 't', status: 'done' }, contextUntil: 0 } }))), { do: 'stop', targets: [] });
  // Not a bare stop.
  for (const t of ['stop that', 'stop the tour', 'stop Chrome', 'stop the music', 'stop worrying', 'stop it from overheating', 'stop talking']) {
    assert.equal(matchStopWord(t, s('T')), null, t);
  }
});

test('stopTargets and chromeTaskRunning read contract (b) state', () => {
  assert.deepEqual(stopTargets({}), []);
  assert.deepEqual(stopTargets(stateFor('V0')), []);
  assert.equal(chromeTaskRunning({ chrome: { task: { status: 'waiting' } } }), true);
  assert.equal(chromeTaskRunning({ chrome: { task: { status: 'stopped' } } }), false);
  assert.equal(chromeTaskRunning({ chrome: { task: null } }), false);
  assert.equal(chromeTaskRunning(null), false);
});

test('whole sentences only: the no-steal corpus never matches, in any state (T1 for these matchers)', () => {
  for (const name of NO_STEAL_STATES) {
    const state = stateFor(name);
    for (const t of NO_STEAL) {
      assert.equal(matchAppCommand(t, state), null, `${name}: ${t}`);
      assert.equal(matchVoiceControl(t, state), null, `${name}: ${t}`);
      assert.equal(matchStopWord(t, state), null, `${name}: ${t}`);
    }
  }
});

test('questions and longer requests stay questions (R3, R4)', () => {
  for (const t of [
    'what is a new chat', 'how do I open settings on my phone', 'can I open the library tomorrow', 'should I use George',
    'open the settings app', 'start a new chat with my boss about the budget', 'open the library at noon', 'show mission control to my son',
    'use the Mac voice memos app', 'repeat the alphabet backwards', 'read the full answer from yesterday about batteries',
  ]) {
    assert.equal(matchAppCommand(t), null, t);
    assert.equal(matchVoiceControl(t), null, t);
  }
});

test('nextVoiceRate: 0.1 a step, within 0.7-1.5', () => {
  assert.equal(nextVoiceRate(1, true), 1.1);
  assert.equal(nextVoiceRate(1, false), 0.9);
  assert.equal(nextVoiceRate(1.5, true), VOICE_RATE.max);
  assert.equal(nextVoiceRate(0.7, false), VOICE_RATE.min);
  assert.equal(nextVoiceRate(0.8, false), 0.7);
  assert.equal(nextVoiceRate('x', true), 1.1);
});

test('moneyWords and spendLine: the readout as said', () => {
  assert.equal(moneyWords(0), '');
  assert.equal(moneyWords(0.001), 'less than a cent');
  assert.equal(moneyWords(0.01), 'about 1 cent');
  assert.equal(moneyWords(0.42), 'about 42 cents');
  assert.equal(moneyWords(3.2), 'about $3.20');
  assert.equal(spendLine({ period: 'today', todayUsd: 0 }), 'Nothing spent today.');
  assert.equal(spendLine({ period: 'today', todayUsd: 0.42 }), 'About 42 cents today.');
  assert.equal(spendLine({ period: 'month', monthUsd: 3.2 }), 'About $3.20 this month.');
  assert.equal(spendLine({ period: 'month', monthUsd: 0 }), 'Nothing spent this month.');
  assert.equal(spendLine({ period: 'both', todayUsd: 0.42, monthUsd: 3.2 }), 'About 42 cents today, about $3.20 this month.');
  assert.equal(spendLine({ period: 'both', todayUsd: 0, monthUsd: 3.2 }), 'Nothing today, about $3.20 this month.');
  assert.equal(spendLine({ period: 'both' }), 'Nothing spent this month.');
  assert.equal(spendLine({ period: 'live', liveUsd: 0.09 }), 'The live view has cost about 9 cents this hour.');
  assert.equal(spendLine({ period: 'live', liveUsd: 0 }), "The live view hasn't cost anything this hour.");
});

test('appCommandLine: one short line for each action (R9)', () => {
  const line = (text, outcome) => appCommandLine(matchAppCommand(text) || matchVoiceControl(text) || matchStopWord(text, stateFor('V0')), outcome);
  assert.equal(line('new chat'), 'New chat.');
  assert.equal(line('open settings'), 'Settings are open.');
  assert.equal(line('open the voice settings'), 'Voice settings are open.');
  assert.equal(line('open history'), 'Your history is open.');
  assert.equal(line('open the library'), 'Your library is open.');
  assert.equal(line('show mission control'), 'Mission Control is open.');
  assert.equal(line('show mission control', { none: true }), "There's no mission to show yet.");
  assert.equal(line('open the home base'), 'The home base is open.');
  assert.equal(line('open the home base', { linked: false }), "The home base isn't linked yet. Here's how to set it up.");
  assert.equal(line('speak slower'), 'Slower.');
  assert.equal(line('speak faster', { limit: true }), "That's as fast as I go.");
  assert.equal(line('turn off continuous'), 'Continuous conversation off. Tap me when you need me.');
  assert.equal(line('send right away'), "I'll send what I hear right away.");
  assert.equal(line('use George'), 'This is George.');
  assert.equal(line('use George', { needsDownload: true }), 'George needs a one-time download first. Voice settings are open.');
  assert.equal(line("use the Mac's voice", { device: 'Mac' }), "This is the Mac's own voice.");
  assert.equal(line('how much have I spent today', { todayUsd: 0 }), 'Nothing spent today.');
  assert.equal(line('be quiet'), 'Okay.');
  assert.equal(line('read the full answer'), '');
  assert.equal(line('read the full answer', { none: true }), "There's nothing more to read.");
  assert.equal(line('repeat that', { none: true }), "I haven't said anything yet.");
  assert.equal(line('stop listening', { woken: true }), "I've stopped listening. Say 'Hey Jarvis' when you need me.");
  assert.equal(line('exit voice mode'), 'Closing Voice Mode.');
  assert.equal(line('stop'), 'Okay.');
  assert.equal(appCommandLine(act('stop', { targets: ['tour', 'chrome'] })), 'The tour is paused and Chrome is stopping.');
  assert.equal(appCommandLine(act('stop', { targets: ['tour', 'chrome', 'liveview'] })), 'The tour is paused, Chrome is stopping and the live view is off.');
  assert.equal(appCommandLine(act('stop', { targets: ['speech'] })), 'Okay.');
  assert.equal(appCommandLine(null), '');
  // Lines never name the extension by its full name (A8: Jarvis must not say his own wake word).
  for (const t of ['tour', 'chrome', 'liveview', 'music']) assert.doesNotMatch(appCommandLine(act('stop', { targets: [t] })), /Jarvis/);
});

test('SHOULD C5: "look at my screen", never from another reading (camera: true), with a Look\'s price', () => {
  for (const t of ['look at my screen', 'Jarvis, take a look at my screen', "what's on my screen", 'check my screen', 'can you see my screen']) {
    assert.deepEqual(pick(matchScreenLook(t)), { do: 'screen-look' }, t);
    assert.equal(matchScreenLook(t).camera, true);
    assert.equal(matchScreenLook(t).free, false);
  }
  for (const t of ['my screen is cracked', 'look at my calendar', 'look at the screen protector', 'how do I take a screenshot on a Mac']) assert.equal(matchScreenLook(t), null, t);
  assert.equal(appCommandLine(act('screen-look')), "Tap Look at my screen when you're ready. A Look costs about 3 cents.");
  assert.equal(appCommandLine(act('screen-look'), { supported: false }), "I can't see this screen.");
});

test('SHOULD C6: "brief me" with no home base asks with the price; with one linked, its own briefing answers', () => {
  assert.deepEqual(pick(matchBriefing('brief me', stateFor('NB'))), { do: 'brief' });
  assert.deepEqual(pick(matchBriefing('run my morning briefing', stateFor('NB'))), { do: 'brief' });
  assert.equal(matchBriefing('brief me', stateFor('V0')), null, 'the home base is linked in V0');
  assert.equal(matchBriefing('what is a briefing', stateFor('NB')), null);
  assert.equal(matchBriefing('brief me', stateFor('NB')).free, false, 'never from another reading');
  assert.equal(appCommandLine(act('brief')), 'Your briefing sends a team of agents to look up the news, about $1.70. Shall I run it?');
});

