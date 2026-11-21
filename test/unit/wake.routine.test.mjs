// The wake routine's words (SPEC §22, src/lib/wake/phrases.js): "wake up, daddy's home" and its
// variants, "Jarvis, standby" / "go to sleep", the answers to the offer (music, the briefing, back to
// sleep; whole or in pieces: "No, go back to sleep"), the greeting by the time of day (one rule with
// the offer and the briefing itself, also after midnight), the offer line; and what the owner played
// lately (src/platform/music-recent.js), which the offer suggests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homePhrase, standbyCommand, routineReply, answerParts, greetingLine, suggestionLine, partOfDayFor, normalizeWords, openingIntent } from '../../src/lib/wake/phrases.js';
import { noteMusicPlayed, recentMusic, suggestedMusic, MUSIC_RECENT_KEY } from '../../src/platform/music-recent.js';
import { getProtocol } from '../../src/ui/protocols.js';

test('home phrases: "wake up", "daddy\'s home", "<name>\'s home", "I\'m home", with what people say around them', () => {
  const yes = [
    'Wake up',
    'Wake up.',
    'Jarvis, wake up.',
    'Hey Jarvis, wake up',
    "Wake up, daddy's home.",
    'wake up daddys home',
    'Wake up daddy is home',
    "Daddy's home!",
    "Dad's home",
    "Mommy's home",
    "Frank's home",
    'Frank is home',
    "Frank Wise's home",
    "I'm home",
    'Im home Jarvis',
    'I am home',
    "Honey, I'm home!",
    "I'm back",
    'wake up, wake up',
    'Rise and shine',
    "Okay Jarvis, I'm home",
    "Daddy's home, wake up",
  ];
  for (const t of yes) assert.equal(homePhrase(t, { name: 'Frank Wise' }), true, t);
  const no = [
    'what time does the Home Depot close',
    'wake up at seven tomorrow',
    'is daddy home yet',
    'play Wake Me Up',
    'home',
    'set an alarm to wake up',
    "Bob's home",
    'I am home sick today, what should I eat',
    '',
  ];
  for (const t of no) assert.equal(homePhrase(t, { name: 'Frank' }), false, t);
  // Without a name, "<name>'s home" is just a name that is not the owner's.
  assert.equal(homePhrase("Frank's home", { name: '' }), false);
  assert.equal(homePhrase("Daddy's home", { name: '' }), true);
});

test('right after waking: a home phrase (or what is left of one), back to sleep, a fragment, or a question', () => {
  const cases = {
    home: ["Wake up, daddy's home.", "daddy's home", 'up daddys home', 'home', "Frank's home", "I'm home, Jarvis"],
    sleep: ['Go back to sleep', 'standby'],
    greet: ['', 'up', 'Jarvis', 'uh', 'hello there'],
    ask: ["What's the weather like today", 'Play some Miles Davis please', 'How far is the moon'],
  };
  for (const [want, list] of Object.entries(cases)) for (const t of list) assert.equal(openingIntent(t, { name: 'Frank' }), want, t);
});

test('standby commands: the whole sentence only', () => {
  for (const t of ['standby', 'Stand by.', 'Jarvis, standby', 'Go to sleep', 'Go back to sleep.', 'Jarvis go to sleep please', 'Sleep mode', 'Good night, Jarvis']) assert.equal(standbyCommand(t), true, t);
  for (const t of ['how do I put my Mac to sleep', 'what is standby mode on a TV', 'I need to sleep more', 'play Go to Sleep by Radiohead', 'stand by me', '']) assert.equal(standbyCommand(t), false, t);
});

test('the answers to the offer: music, the briefing, back to sleep; anything else is a question', () => {
  const cases = {
    music: ['Yes', 'Yes please.', 'yeah', 'Sure, Jarvis.', 'Play it.', 'Put it on', 'Go ahead', 'Okay', 'Sounds good', 'Let\'s hear it', 'music'],
    brief: ['Brief me', 'Brief me please', 'The briefing', 'Run my evening briefing', 'run the briefing', 'Catch me up', 'Morning briefing', 'the news'],
    sleep: ['No', 'No thanks.', 'Not now', 'Nope', 'Go back to sleep', 'That\'s all', 'Never mind', "I'm good", 'Standby'],
  };
  for (const [want, list] of Object.entries(cases)) for (const t of list) assert.equal(routineReply(t), want, t);
  for (const t of ['What is the weather like', 'Yes, and what is the weather', 'Play Thunderstruck', 'No, play Highway to Hell', 'Brief me on the news about Apple', '']) assert.equal(routineReply(t), null, t);
});

test('the answers in pieces: an answer word, then what it means ("No, go back to sleep"), thanks aside', () => {
  const cases = {
    sleep: ['No, go back to sleep.', 'No thanks, go back to sleep.', 'Nope, go back to sleep', 'No. Go to sleep.', 'Not now, thanks.', 'No, thank you. Go back to sleep.', 'No thanks, Jarvis.', 'Thanks, go back to sleep', 'Okay, go to sleep', 'No, that’s all, thanks.'],
    music: ['Yes, please do.', 'Yeah, sure.', 'Yes please, go ahead.', 'Okay, sure.', 'Sure, play it.', 'Yeah, sounds good, thanks.'],
    brief: ['Sure, run the briefing.', 'Yes, brief me.', 'No, just the briefing.', 'Okay, catch me up.', 'Yeah, give me the news.'],
  };
  for (const [want, list] of Object.entries(cases)) for (const t of list) assert.equal(routineReply(t), want, t);
  // Not the routine's: the rest is a question or another request; "Thank you." alone is unclear.
  for (const t of ['Yes, and what is the weather', 'No, play Highway to Hell', 'Yes, play some AC/DC.', 'Sure, what time is it', 'Thank you.', 'No, stand by me']) assert.equal(routineReply(t), null, t);
  assert.deepEqual(answerParts('No thanks, go back to sleep, Jarvis.'), { answer: 'no', rest: 'go back to sleep' });
  assert.deepEqual(answerParts('Yes, play some AC/DC.'), { answer: 'yes', rest: 'play some ac dc' });
  assert.equal(answerParts('Play some AC/DC'), null);
  // The same pieces close Voice Mode into Standby outside the routine too.
  for (const t of ['No thanks, go back to sleep.', 'Okay, standby.', 'Thanks Jarvis, go back to sleep', 'Nope. Go to sleep.']) assert.equal(standbyCommand(t), true, t);
  for (const t of ['No, stand by me', 'Yes, I need to sleep more', 'Okay, how do I put my Mac to sleep']) assert.equal(standbyCommand(t), false, t);
  assert.equal(openingIntent('No, go back to sleep.', { name: 'Frank' }), 'sleep');
});

test('the greeting follows the time of day; after a home phrase it is "Welcome home"', () => {
  const at = (h) => new Date(2026, 10, 21, h, 15);
  assert.equal(greetingLine({ now: at(7), name: 'Frank' }), 'Good morning, Frank.');
  assert.equal(greetingLine({ now: at(13), name: 'Frank' }), 'Good afternoon, Frank.');
  assert.equal(greetingLine({ now: at(19), name: 'Frank' }), 'Good evening, Frank.');
  assert.equal(greetingLine({ now: at(2), name: 'Frank' }), 'Good morning, Frank.', 'after midnight: morning, like the briefing');
  assert.equal(greetingLine({ now: at(19), name: '' }), 'Good evening, sir.');
  assert.equal(greetingLine({ now: at(9), name: 'Frank', home: true }), 'Welcome home, Frank.');
  assert.equal(partOfDayFor(at(7)), 'morning');
  assert.equal(partOfDayFor(at(15)), 'afternoon');
  assert.equal(partOfDayFor(at(23)), 'evening');
});

test('one rule for the time of day: the greeting, the offer and the briefing itself agree at every hour (1:30 a.m. too)', () => {
  const late = new Date(2026, 10, 21, 1, 30);
  const said = `${greetingLine({ now: late, name: 'Frank' })} ${suggestionLine({ artist: 'AC/DC', part: partOfDayFor(late) })}`;
  assert.equal(said, 'Good morning, Frank. Shall I put on some AC/DC? Or I can run your morning briefing.');
  const briefing = getProtocol('morning-briefing');
  for (let h = 0; h < 24; h++) {
    const now = new Date(2026, 10, 21, h, 30);
    const part = partOfDayFor(now);
    assert.equal(greetingLine({ now, name: 'Frank' }), `Good ${part}, Frank.`, `${h}:30 greeting`);
    assert.match(suggestionLine({ artist: '', part }), new RegExp(`your ${part} briefing\\?$`), `${h}:30 offer`);
    const prompt = briefing.buildPrompt({ input: '', settings: { userName: 'Frank' }, now });
    assert.ok(prompt.includes(`Open with "Good ${part}, Frank."`), `${h}:30: the briefing opens "Good ${part}" too`);
  }
});

test('the offer: music when Apple Music found some, and the briefing for the time of day', () => {
  assert.equal(suggestionLine({ artist: 'AC/DC', part: 'evening' }), 'Shall I put on some AC/DC? Or I can run your evening briefing.');
  assert.equal(suggestionLine({ artist: '', part: 'morning' }), 'Shall I run your morning briefing?');
  assert.equal(normalizeWords('  Daddy’s  HOME!! '), "daddy's home");
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('what was played lately: the newest artist first, once each; else Back in Black by AC/DC', () => {
  const storage = memoryStorage();
  const t0 = Date.UTC(2026, 10, 21, 20);
  // The default is pinned by Apple's ids (looked up: an iPhone's search can be sent to the Music app).
  assert.deepEqual(suggestedMusic({ storage, now: t0 }), { artist: 'AC/DC', title: 'Back in Black', kind: 'song', query: 'Back in Black AC/DC', fromHistory: false, artistId: '5040714', ids: ['574050602'] });
  noteMusicPlayed({ artist: 'Miles Davis', title: 'So What', type: 'song' }, { storage, now: t0 });
  noteMusicPlayed({ artist: 'Fleetwood Mac', title: 'Rumours', type: 'album' }, { storage, now: t0 + 1000 });
  noteMusicPlayed({ artist: 'miles davis', title: 'Blue in Green', type: 'song' }, { storage, now: t0 + 2000 });
  const list = recentMusic({ storage, now: t0 + 3000 });
  assert.deepEqual(list.map((e) => e.artist), ['miles davis', 'Fleetwood Mac'], 'one entry per artist, newest first');
  assert.deepEqual(suggestedMusic({ storage, now: t0 + 3000 }), { artist: 'miles davis', title: 'Blue in Green', kind: 'artist', query: 'miles davis', fromHistory: true, artistId: '', ids: [] });
  // A MusicItem played (a preview, a "play …" found) keeps its Apple ids: the offer is a lookup.
  noteMusicPlayed({ type: 'song', id: '268443097', title: 'So What', artist: 'Miles Davis', artistId: '44984' }, { storage, now: t0 + 4000 });
  assert.deepEqual(suggestedMusic({ storage, now: t0 + 5000 }), { artist: 'Miles Davis', title: 'So What', kind: 'artist', query: 'Miles Davis', fromHistory: true, artistId: '44984', ids: ['268443097'] });
  storage.setItem(MUSIC_RECENT_KEY, JSON.stringify([{ artist: 'X', at: t0, artistId: '12; drop', id: -4 }]));
  assert.deepEqual(recentMusic({ storage, now: t0 }), [{ artist: 'X', title: '', kind: 'song', at: t0 }], 'ids that are not ids are dropped');
  // Old entries are not "lately"; damaged storage is ignored; text is one clean line.
  assert.equal(recentMusic({ storage, now: t0 + 200 * 24 * 3600 * 1000 }).length, 0);
  storage.setItem(MUSIC_RECENT_KEY, '{not json');
  assert.deepEqual(recentMusic({ storage }), []);
  storage.setItem(MUSIC_RECENT_KEY, JSON.stringify([{ artist: 'A‮B\nC', at: t0 }, { nope: 1 }, 'x']));
  assert.deepEqual(recentMusic({ storage, now: t0 }).map((e) => e.artist), ['A B C']);
  assert.equal(noteMusicPlayed({ artist: '   ' }, { storage }), false);
});
