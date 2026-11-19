// Voice ranking (tts.js voiceQuality, rankVoices, pickDefaultVoice) with realistic voice lists
// from iOS, macOS, Windows (Edge), Chrome desktop and Android. Pure functions, run in plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceQuality, rankVoices, pickDefaultVoice, resolveVoice } from '../../src/platform/voice/tts.js';

const v = (name, lang, localService = true, extra = {}) => ({ name, lang, localService, voiceURI: extra.voiceURI || name, default: false, ...extra });
const names = (list) => list.map((x) => x.name);

// iPhone (iOS Safari): compact voices plus the ones the owner downloaded in Settings.
const IOS = [
  v('Samantha', 'en-US', true, { default: true, voiceURI: 'com.apple.voice.compact.en-US.Samantha' }),
  v('Albert', 'en-US', true, { voiceURI: 'com.apple.speech.synthesis.voice.Albert' }),
  v('Daniel', 'en-GB', true, { voiceURI: 'com.apple.voice.compact.en-GB.Daniel' }),
  v('Martha', 'en-GB', true, { voiceURI: 'com.apple.voice.compact.en-GB.Martha' }),
  v('Daniel (Enhanced)', 'en-GB', true, { voiceURI: 'com.apple.voice.enhanced.en-GB.Daniel' }),
  v('Eddy (English (UK))', 'en-GB', true, { voiceURI: 'com.apple.eloquence.en-GB.Eddy' }),
  v('Karen', 'en-AU', true, { voiceURI: 'com.apple.voice.compact.en-AU.Karen' }),
  v('Arthur (Premium)', 'en-GB', true, { voiceURI: 'com.apple.voice.premium.en-GB.Arthur' }),
  v('Rishi', 'en-IN', true, { voiceURI: 'com.apple.voice.compact.en-IN.Rishi' }),
  v('Thomas', 'fr-FR', true, { voiceURI: 'com.apple.voice.compact.fr-FR.Thomas' }),
  v('Anna', 'de-DE', true, { voiceURI: 'com.apple.voice.compact.de-DE.Anna' }),
];

// Mac (Safari): Daniel plus the novelty and Eloquence voices.
const MAC = [
  v('Samantha', 'en-US', true, { default: true }),
  v('Alex', 'en-US', true, { voiceURI: 'com.apple.speech.synthesis.voice.Alex' }),
  v('Bad News', 'en-US', true, { voiceURI: 'com.apple.speech.synthesis.voice.BadNews' }),
  v('Bubbles', 'en-US', true, { voiceURI: 'com.apple.speech.synthesis.voice.Bubbles' }),
  v('Zarvox', 'en-US', true, { voiceURI: 'com.apple.speech.synthesis.voice.Zarvox' }),
  v('Rocko (English (UK))', 'en-GB', true, { voiceURI: 'com.apple.eloquence.en-GB.Rocko' }),
  v('Moira', 'en-IE', true),
  v('Daniel', 'en-GB', true, { voiceURI: 'com.apple.voice.compact.en-GB.Daniel' }),
  v('Amélie', 'fr-CA', true),
];

// Windows, Microsoft Edge: on-device voices plus Microsoft's online "Natural" voices.
const EDGE = [
  v('Microsoft David - English (United States)', 'en-US', true, { default: true }),
  v('Microsoft Mark - English (United States)', 'en-US', true),
  v('Microsoft Zira - English (United States)', 'en-US', true),
  v('Microsoft Hazel - English (United Kingdom)', 'en-GB', true),
  v('Microsoft George - English (United Kingdom)', 'en-GB', true),
  v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
  v('Microsoft Guy Online (Natural) - English (United States)', 'en-US', false),
  v('Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB', false),
  v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB', false),
  v('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB', false),
  v('Microsoft Thomas Online (Natural) - English (United Kingdom)', 'en-GB', false),
  v('Microsoft Denise Online (Natural) - French (France)', 'fr-FR', false),
];

// Chrome on Linux or ChromeOS: Google's online voices only.
const CHROME = [
  v('Google Deutsch', 'de-DE', false),
  v('Google US English', 'en-US', false, { default: true }),
  v('Google UK English Female', 'en-GB', false),
  v('Google UK English Male', 'en-GB', false),
  v('Google français', 'fr-FR', false),
];

// Android (Chrome): the system's Google voices, underscores in the language tags.
const ANDROID = [
  v('English United States', 'en_US', true, { default: true }),
  v('English India', 'en_IN', true),
  v('en-gb-x-gbd-network', 'en_GB', false),
  v('English United Kingdom', 'en_GB', true),
  v('Deutsch Deutschland', 'de_DE', true),
];

test('voiceQuality: premium, enhanced, natural or standard, from the name or the voiceURI', () => {
  const q = (name, voiceURI = '') => voiceQuality({ name, voiceURI });
  assert.equal(q('Arthur (Premium)'), 'premium');
  assert.equal(q('Malcolm', 'com.apple.voice.premium.en-GB.Malcolm'), 'premium');
  assert.equal(q('Jamie', 'com.apple.ttsbundle.siri_Jamie_en-GB-premium'), 'premium');
  assert.equal(q('Daniel (Enhanced)'), 'enhanced');
  assert.equal(q('Daniel', 'com.apple.voice.enhanced.en-GB.Daniel'), 'enhanced');
  assert.equal(q('Microsoft Ryan Online (Natural) - English (United Kingdom)'), 'natural');
  assert.equal(q('Some NEURAL voice'), 'natural');
  for (const name of ['Daniel', 'Google UK English Male', 'Supernatural Sam', 'Enhancer', 'Premiumly']) assert.equal(q(name), 'standard', name);
  assert.equal(q('Daniel', 'com.apple.voice.compact.en-GB.Daniel'), 'standard');
  for (const junk of [null, undefined, 3, 'Daniel (Enhanced)', {}]) assert.equal(voiceQuality(junk), 'standard');
});

test('rankVoices: iPhone - the downloaded Premium and Enhanced British voices first, novelty voices last', () => {
  assert.deepEqual(names(rankVoices(IOS)), [
    'Arthur (Premium)',
    'Daniel (Enhanced)',
    'Daniel',
    'Martha',
    'Rishi',
    'Samantha',
    'Karen',
    'Eddy (English (UK))',
    'Albert',
    'Thomas',
    'Anna',
  ]);
  assert.equal(pickDefaultVoice(IOS).name, 'Arthur (Premium)');
  // Before the owner downloads anything: the compact Daniel.
  assert.equal(pickDefaultVoice(IOS.filter((x) => voiceQuality(x) === 'standard')).name, 'Daniel');
  // A new array; the input is untouched.
  const copy = IOS.slice();
  assert.notEqual(rankVoices(IOS), IOS);
  assert.deepEqual(IOS, copy);
});

test('rankVoices: Mac - Daniel first, never a novelty voice', () => {
  assert.deepEqual(names(rankVoices(MAC)), ['Daniel', 'Alex', 'Samantha', 'Moira', 'Rocko (English (UK))', 'Bad News', 'Bubbles', 'Zarvox', 'Amélie']);
  assert.equal(pickDefaultVoice(MAC).name, 'Daniel');
  assert.equal(pickDefaultVoice(MAC.filter((x) => x.name !== 'Daniel')).name, 'Alex');
});

test('rankVoices: Chrome on a Mac - the Eloquence voices (voiceURI = their name) come after every standard voice (review UX-6)', () => {
  // Chrome reports macOS voices with voiceURI equal to the name, so "eloquence" is not in it.
  const MAC_CHROME = [
    v('Samantha', 'en-US', true, { default: true }),
    v('Albert', 'en-US', true),
    v('Daniel', 'en-GB', true),
    v('Eddy (English (UK))', 'en-GB', true),
    v('Grandpa (English (UK))', 'en-GB', true),
    v('Rocko (English (UK))', 'en-GB', true),
    v('Shelley (English (US))', 'en-US', true),
    v('Google UK English Male', 'en-GB', false),
  ];
  assert.deepEqual(names(rankVoices(MAC_CHROME)), [
    'Daniel',
    'Samantha',
    'Eddy (English (UK))',
    'Grandpa (English (UK))',
    'Rocko (English (UK))',
    'Albert',
    'Shelley (English (US))',
    'Google UK English Male',
  ]);
  assert.equal(pickDefaultVoice(MAC_CHROME.filter((x) => x.name !== 'Daniel')).name, 'Samantha');
  // A voice merely named like one (no Chrome suffix) is not a novelty voice.
  assert.equal(pickDefaultVoice([v('Reed', 'en-GB', true), v('Moira', 'en-IE', true)]).name, 'Reed');
});

test('rankVoices: Windows Edge - on-device voices before the online Natural ones (privacy), British first in each', () => {
  assert.deepEqual(names(rankVoices(EDGE)), [
    'Microsoft George - English (United Kingdom)',
    'Microsoft Hazel - English (United Kingdom)',
    'Microsoft David - English (United States)',
    'Microsoft Mark - English (United States)',
    'Microsoft Zira - English (United States)',
    'Microsoft Ryan Online (Natural) - English (United Kingdom)',
    'Microsoft Thomas Online (Natural) - English (United Kingdom)',
    'Microsoft Libby Online (Natural) - English (United Kingdom)',
    'Microsoft Sonia Online (Natural) - English (United Kingdom)',
    'Microsoft Guy Online (Natural) - English (United States)',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Denise Online (Natural) - French (France)',
  ]);
  assert.equal(pickDefaultVoice(EDGE).name, 'Microsoft George - English (United Kingdom)');
  // Only the online voices left: the best of those (the owner can also pick one in Settings).
  assert.equal(pickDefaultVoice(EDGE.filter((x) => !x.localService)).name, 'Microsoft Ryan Online (Natural) - English (United Kingdom)');
  assert.equal(resolveVoice('Microsoft Sonia Online (Natural) - English (United Kingdom)', EDGE).name, 'Microsoft Sonia Online (Natural) - English (United Kingdom)');
});

test('rankVoices: Chrome desktop with only Google online voices, and Android', () => {
  assert.deepEqual(names(rankVoices(CHROME)), ['Google UK English Male', 'Google UK English Female', 'Google US English', 'Google Deutsch', 'Google français']);
  assert.equal(pickDefaultVoice(CHROME).name, 'Google UK English Male');
  assert.deepEqual(names(rankVoices(ANDROID)), ['English United Kingdom', 'English United States', 'English India', 'en-gb-x-gbd-network', 'Deutsch Deutschland']);
  assert.equal(pickDefaultVoice(ANDROID).name, 'English United Kingdom');
});

test('pickDefaultVoice uses the same scoring: quality, then British, preferred names, male-sounding; privacy rule kept', () => {
  const pick = (list) => pickDefaultVoice(list)?.name ?? null;
  // A downloaded "Daniel (Enhanced)" or "Arthur (Premium)" beats the compact "Daniel".
  assert.equal(pick([v('Daniel', 'en-GB'), v('Daniel (Enhanced)', 'en-GB')]), 'Daniel (Enhanced)');
  assert.equal(pick([v('Daniel', 'en-GB'), v('Arthur (Premium)', 'en-GB'), v('Daniel (Enhanced)', 'en-GB')]), 'Arthur (Premium)');
  // The preferred names in order, British first.
  assert.equal(pick([v('Thomas', 'en-GB'), v('Ryan', 'en-GB'), v('George', 'en-GB'), v('Malcolm', 'en-GB'), v('Jamie', 'en-GB'), v('Oliver', 'en-GB')]), 'Oliver');
  assert.equal(pick([v('Daniel', 'en-US'), v('Fred', 'en-GB')]), 'Fred');
  // On-device beats a better online voice; an unknown locality sits between.
  assert.equal(pick([v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB', false), v('Microsoft Zira - English (United States)', 'en-US', true)]), 'Microsoft Zira - English (United States)');
  assert.equal(pick([v('Google UK English Male', 'en-GB', false), v('Mystery Voice', 'en-US', undefined)]), 'Mystery Voice');
  // English before other languages, even an online English voice before an on-device French one.
  assert.equal(pick([v('Thomas', 'fr-FR', true, { default: true }), v('Google UK English Male', 'en-GB', false)]), 'Google UK English Male');
  // No English: the browser's default, then the first.
  assert.equal(pick([v('Thomas', 'fr-FR'), v('Anna', 'de-DE', true, { default: true })]), 'Anna');
  assert.equal(pick([v('Thomas', 'fr-FR'), v('Anna', 'de-DE')]), 'Thomas');
  // Junk.
  assert.equal(pick([]), null);
  assert.equal(pickDefaultVoice(null), null);
  assert.equal(pickDefaultVoice([null, {}, 3, { name: 7 }]), null);
  assert.deepEqual(rankVoices('nope'), []);
});
