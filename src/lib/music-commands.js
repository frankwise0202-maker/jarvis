// Apple Music (find & open): the local, free matcher for music words, typed or said. No DOM, no
// tokens. What it takes is acted on in the app (a search and a Music card); anything else goes
// to Jarvis as usual, who can still call find_music (recommendations, "something for a rainy day").
//
//   matchMusicCommand('play Back in Black')
//     -> { action: 'play', kind: 'song', query: 'back in black', title: 'back in black', artist: '' }
//   matchMusicCommand('Jarvis, play Back in Black by AC/DC')
//     -> { action: 'play', kind: 'song', query: 'back in black ac/dc', title: 'back in black', artist: 'ac/dc' }
//   matchMusicCommand('put on some Miles Davis')           -> { action: 'play', kind: 'artist', query: 'miles davis', … }
//   matchMusicCommand('play the album Rumours')            -> { action: 'play', kind: 'album', query: 'rumours', … }
//   matchMusicCommand('play my workout playlist')          -> { action: 'play', kind: 'playlist', query: 'workout', … }
//   matchMusicCommand('open Thriller in Apple Music')      -> { action: 'open', kind: 'song', query: 'thriller', … }
//   matchMusicCommand('play a preview of Hey Jude')        -> { action: 'preview', kind: 'song', query: 'hey jude', … }
//   matchMusicCommand('stop the music')                    -> { action: 'stop' }
//   matchMusicCommand('what role does OPEC play in prices') -> null (a question)
//   matchMusicCommand('play devil\'s advocate')             -> null (not music)
//   matchMusicCommand('play something relaxing')           -> null (Jarvis picks the songs: find_music)
//
// Deliberately strict: it needs a music verb at the start ("play", "put on", "let me hear", or
// "open"/"find"/"show me" with Apple Music or "the song/album" named), a concrete title or artist,
// and none of the idioms where "play" is not about music. Speech-to-text slips are folded first
// ("play list", "apple muse ick", "a c d c", "played back in black").

const MAX_WORDS = 16;

// Leading fillers and politeness (removed repeatedly from the start).
const LEAD_FILLERS = [
  'hey jarvis', 'ok jarvis', 'okay jarvis', 'jarvis', 'jervis',
  'can you please', 'could you please', 'would you please', 'will you please', 'would you mind',
  'can you', 'could you', 'would you', 'will you', 'can we', 'could we', 'go ahead and', 'i need you to',
  'i want you to', 'i would like you to', 'i d like you to', 'id like you to',
  'please', 'pls', 'kindly', 'just', 'now', 'hey', 'yo', 'ok', 'okay', 'alright', 'all right', 'so', 'and', 'um', 'umm', 'uh', 'er', 'erm', 'hmm',
];
// Trailing fillers (removed repeatedly from the end).
const TAIL_FILLERS = ['please', 'pls', 'for me', 'now', 'right now', 'thanks', 'thank you', 'jarvis', 'sir', 'again', 'real quick', 'quickly', 'if you can', 'if you could', 'for a bit', 'for a while'];
// "… in Apple Music" (and slips): where to open it; also what makes "open X" a music command.
const APPLE_TAIL = /\s+(?:in|on|from|with|using|via|through) (?:the )?(?:apple music|itunes|music app|apple music app|music)(?: app)?$/;

const SLIPS = [
  [/^(?:played|plays|plate|pley)\b/, 'play'],
  [/\bplay ?lists?\b/g, 'playlist'],
  [/\bapple (?:muse ?ick|muse ic|musics|music s|muzak|music app)\b/g, 'apple music'],
  [/\bi ?tunes\b/g, 'itunes'],
  [/\bpre ?view\b/g, 'preview'],
  [/\b(?:a c d c|a c dc|ac dc|acdc|ac\/dc)\b/g, 'ac/dc'],
  [/\bput (it|that|this) on\b/g, 'put $1 on'],
  [/\bi wanna\b/g, 'i want to'],
  [/\bgonna\b/g, 'going to'],
];

// What starts a music command, after the fillers: [regex, action, needsMusicWords].
const VERBS = [
  [/^(?:play|pay) (?:me |us )?(?:a |the |some )?(?:preview|sample|clip|snippet|taste|bit|30 seconds|thirty seconds) (?:of|from) /, 'preview', false],
  [/^(?:give me|let me hear|let s hear|lets hear) (?:a |the )?(?:preview|sample|clip|snippet) (?:of|from) /, 'preview', false],
  [/^preview /, 'preview', false],
  [/^(?:play|pay) me /, 'play', false],
  [/^(?:play|start playing) /, 'play', false],
  [/^(?:put on|throw on|queue up|queue|spin|blast|crank up|crank) /, 'play', 'loose'],
  [/^(?:let me hear|let s hear|lets hear|i want to hear|i d like to hear|id like to hear|i would like to hear|can i hear|i want to listen to|i d like to listen to|let s listen to|lets listen to|can we listen to|listen to) /, 'play', false],
  [/^(?:open|find|show me|show|pull up|bring up|look up|search for|search|get me|get|find me) /, 'open', true],
];

// Stop (the preview): "stop the music", "pause the preview", "music off".
const STOP_RE = /^(?:(?:stop|pause|end|kill|turn off|switch off|cut|silence|mute|halt)(?: playing)?(?: the| this| that| my)? (?:music|song|preview|track|tune|audio clip|clip|sample|playback)|stop playing(?: (?:it|that|this|the song|the music|the preview))?|(?:music|preview) (?:off|stop)|stop the apple music(?: preview)?)$/;

// After the verb: "play X" where X is one of these is not a song.
const IDIOM_START = new RegExp(
  `^(?:${[
    'devil s advocate', 'devils advocate', 'the devil s advocate', 'a game', 'game', 'games', 'a round', 'chess', 'checkers', 'poker', 'cards', 'blackjack', 'bridge', 'tic tac toe', '20 questions', 'twenty questions',
    'trivia', 'a quiz', 'quiz', 'hangman', 'the role', 'a role', 'role', 'roles', 'along', 'it safe', 'it by ear', 'it cool', 'it straight', 'dumb', 'pretend', 'nice', 'fair', 'hardball', 'catch',
    'with', 'against', 'the field', 'hooky', 'dead', 'god', 'a part', 'a big part', 'a key part', 'a role in', 'the victim', 'both sides', 'favorites', 'favourites', 'the long game', 'the odds', 'the lottery', 'the market',
    'the stock market', 'golf', 'tennis', 'football', 'soccer', 'basketball', 'baseball', 'hockey', 'cricket', 'video games', 'minecraft', 'fortnite', 'wordle', 'sudoku', 'hide and seek',
    'rock paper scissors', 'would you rather', 'word games', 'word association', 'the piano', 'piano', 'guitar', 'the guitar', 'drums', 'the drums', 'violin', 'the violin', 'an instrument', 'out',
    'into', 'havoc', 'a trick', 'tricks', 'a joke', 'a prank', 'a hand', 'a card', 'my cards', 'your cards', 'host', 'doctor', 'detective', 'the hero', 'the villain', 'politics', 'to win', 'to lose',
    'up', 'down', 'off', 'around', 'well', 'tag', 'house', 'the fool', 'second fiddle', 'the blame game', 'the numbers', 'by the rules', 'the system', 'the game',
    'the news', 'news', 'the weather', 'weather', 'the forecast', 'traffic', 'the headlines', 'a sound', 'sounds', 'an alarm', 'the alarm', 'a beep', 'a chime', 'the chime', 'a ringtone', 'a timer',
  ].join('|')})(?: |$)`,
);
// Things that are Jarvis's own (play back the answer) or not music at all.
const NOT_MUSIC = /^(?:back (?:the|that|this|your|my|it|what)\b|(?:it|that|this|them|those|these)(?: (?:again|back|one|one again|song|track|tune|for me))?$|(?:the |your |my |that |this |a )?(?:last )?(?:answer|reply|response|message|recording|voicemail|voice memo|voice note|briefing|morning briefing|summary|report|hologram|blueprint|video|movie|film|trailer|episode|podcast|audiobook|audio book|show|tv show|youtube video)s?(?: again| back)?$)/;
const NOT_MUSIC_ANYWHERE = /\b(?:on (?:the |my )?(?:tv|television|homepod|speaker|speakers|sonos|alexa|echo|chromecast|airplay|apple tv|youtube|spotify|netflix|pandora|tidal|soundcloud|amazon music|youtube music)|spotify|youtube|netflix|podcast|podcasts|audiobook|episode|movie|video game|videogame|voicemail|voicemails|voice memo|voice message|voice note|recording|recordings|messages|about)\b/;
// What follows "play" / "let me hear" / "listen to" when it is not a title: thoughts, more about,
// the pros and cons, my draft, something for a mood (Jarvis picks music himself: find_music).
const NOT_TITLE_START = /^(?:your|my|our|his|her|their|its|more|what|how|why|when|where|who|whom|which|this|that|these|those|it|them|me|us|him|both|all|everything|anything|something|nothing|someone|somebody|whatever|a bit|a little|the rest|the pros|the cons|the latest|the news|the full|the whole|the details|the summary|the answer|the reply|the report|the plan|an update|an explanation|a summary|a recap|a joke|a story|a word|a few words|any|each|every|no|some music|some songs|music|songs)\b/;
// Generic or mood words: no concrete title or artist, so Jarvis chooses (find_music).
const GENERIC = new Set(
  (
    'music songs song tunes tune jams jam stuff something anything whatever everything nothing more radio station mix ' +
    'jazz blues rock pop classical country hip hop rap r&b rnb soul funk disco house techno edm electronic electronica lofi lo fi ambient chill chillout ' +
    'metal punk reggae latin salsa kpop k pop indie folk gospel opera instrumental acoustic piano background white noise rain sounds nature sounds ' +
    'christmas holiday xmas workout gym party dinner study studying sleep sleeping focus relaxing relax calm calming upbeat happy sad mellow romantic ' +
    'good nice great new old fun favorite favourite random popular trending top hits classic classics oldies throwback music for to while the a an of my some me us ' +
    'your his her their our any one ones it this that them next previous last first same other another different louder quieter loud quiet playlist playlists'
  ).split(' '),
);
// "Put on some coffee": things one puts on that are not music.
const HOUSEHOLD = /^(?:coffee|tea|water|sunscreen|sun screen|lotion|cream|clothes|pants|shoes|socks|a jacket|jacket|a coat|weight|makeup|make up|perfume|the kettle|a pot|a timer|an alarm|the lights|lights|the heating|heat|the heat|the ac|the air|the fan|the tv|tv|a movie|a show|the news|the game|pressure|gloves|a hat|a mask|glasses|a smile)$/;
const PRONOUN_ARTIST = new Set(['me', 'you', 'us', 'him', 'her', 'them', 'it', 'myself', 'yourself', 'my side', 'the way', 'the sea', 'the river', 'the bay', 'the water', 'the window', 'the door', 'the light']);
const QUESTION_START = /^(?:what|whats|what s|who|whom|whose|which|why|how|when|where|is|are|was|were|do|does|did|should|shall|has|have|had|am|isn t|aren t|don t|doesn t|didn t|tell me|explain|describe|compare|define)\b/;

/** Lowercase words; punctuation off except inside names (AC/DC, Guns N' Roses, M.I.A.); slips folded. */
export function normalizeMusicText(text) {
  let s = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»"„]/g, ' ')
    .replace(/[,;:?¡¿…()[\]{}<>|*_~^=]+/g, ' ')
    .replace(/!+(?=\s|$)/g, ' ')
    .replace(/(^|\s)'+|'+(?=\s|$)/g, ' ') // quotes around words, not "guns n' roses"? kept below
    .replace(/\.+(?=\s|$)/g, ' ')
    .replace(/\s+-+\s+|\s+–\s+|\s+—\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/(\w)'(\w)/g, '$1 $2').replace(/\bi m\b/g, 'im');
  for (const [re, to] of SLIPS) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

function stripLead(s) {
  let out = s;
  for (let guard = 0; guard < 8; guard++) {
    const f = LEAD_FILLERS.find((w) => out === w || out.startsWith(`${w} `));
    if (!f) break;
    out = out.slice(f.length).trim();
  }
  return out;
}

function stripTail(s) {
  let out = s;
  for (let guard = 0; guard < 8; guard++) {
    const f = TAIL_FILLERS.find((w) => out === w || out.endsWith(` ${w}`));
    if (!f) break;
    out = out.slice(0, out.length - f.length).trim();
  }
  return out;
}

const isGeneric = (phrase) => phrase.split(' ').every((w) => GENERIC.has(w));

/**
 * The music command in `text`, or null.
 * { action: 'play' | 'open' | 'preview' | 'stop', kind: 'song' | 'album' | 'artist' | 'playlist',
 *   query, title, artist, apple: boolean (Apple Music was named), text }
 */
export function matchMusicCommand(text) {
  const norm = normalizeMusicText(text);
  if (!norm) return null;
  let s = stripTail(stripLead(norm));
  if (!s || s.split(' ').length > MAX_WORDS) return null;
  if (STOP_RE.test(s)) return { action: 'stop', kind: null, query: '', title: '', artist: '', apple: false, text: s };
  if (QUESTION_START.test(s)) return null;

  let apple = false;
  const tail = APPLE_TAIL.exec(s);
  if (tail) {
    apple = true;
    s = stripTail(s.slice(0, tail.index).trim());
  }
  // "search apple music for X", "open apple music and play X"
  const searchApple = /^(?:search|look in|check) (?:apple music|itunes) for /.exec(s) || /^(?:open|go to) (?:apple music|itunes)(?: and)? (?:play|find|search for|show me) /.exec(s);
  let action = null;
  let rest = '';
  let loose = false; // "put on X": only with music words ("some X", "the album X", "X by Y")
  if (searchApple) {
    apple = true;
    action = /play/.test(searchApple[0]) ? 'play' : 'open';
    rest = s.slice(searchApple[0].length);
  } else {
    for (const [re, act, needsMusic] of VERBS) {
      const m = re.exec(s);
      if (!m) continue;
      rest = s.slice(m[0].length);
      if (needsMusic === true && !apple && !/^(?:the |a |that |this )?(?:song|track|single|album|record|lp|ep|playlist)\b/.test(rest)) return null;
      loose = needsMusic === 'loose';
      action = act;
      break;
    }
  }
  if (!action) return null;
  rest = stripTail(rest.trim());
  if (!rest) return null;
  if (IDIOM_START.test(rest) || NOT_MUSIC.test(rest) || NOT_MUSIC_ANYWHERE.test(rest)) return null;

  // The kind, from the words around the title.
  let kind = 'song';
  let m;
  if ((m = /^(?:the |a |that |this )?(?:album|record|lp|ep|full album)(?: called| named| titled)? (.+)$/.exec(rest))) {
    kind = 'album';
    rest = m[1];
  } else if ((m = /^(?:the |a |that |this )?(?:song|track|single|tune)(?: called| named| titled)? (.+)$/.exec(rest))) {
    kind = 'song';
    rest = m[1];
  } else if ((m = /^(?:the |a |my |our )?playlist(?: called| named| titled)? (.+)$/.exec(rest)) || (m = /^(?:my |our |the |a |some )?(.+?) playlist$/.exec(rest))) {
    kind = 'playlist';
    rest = m[1];
  } else if ((m = /^(?:the |a |that )?(.+?) (?:album|record|lp)$/.exec(rest))) {
    kind = 'album';
    rest = m[1];
  } else if ((m = /^(?:the |a |that )?(.+?) (?:song|track|single)$/.exec(rest))) {
    kind = 'song';
    rest = m[1];
  } else if (
    (m = /^(?:some(?: songs| music| tracks| tunes)? (?:by|from|of) |something (?:by|from) |anything (?:by|from) |(?:a few |some |a couple of )?(?:songs|tracks|tunes|hits|music) (?:by|from) |a song (?:by|from) |the best of |the hits of |(?:the )?top songs (?:by|of|from) |(?:the )?greatest hits (?:by|of|from) |some |more )(.+)$/.exec(rest))
  ) {
    kind = 'artist';
    rest = m[1];
  } else if ((m = /^(.+?) s (?:top songs|greatest hits|best songs|hits|songs|music)$/.exec(rest))) {
    kind = 'artist';
    rest = m[1];
  }
  rest = rest.replace(/^(?:the song |the track |the album )/, '').trim();
  // ("Your Song by Elton John" names its artist, so it is a title after all.)
  if (kind !== 'playlist' && NOT_TITLE_START.test(rest) && !/ by \S/.test(rest)) return null;
  // A playlist may be named by a mood ("my workout playlist"): Apple Music has no free playlist
  // search, so it is searched as albums and songs; it needs one word beyond "my" or "the".
  const generic = kind === 'playlist' ? !rest.split(' ').some((w) => !['my', 'our', 'the', 'a', 'an', 'some', 'me', 'us', 'playlist', 'playlists', 'music', 'songs'].includes(w)) : isGeneric(rest);
  if (!rest || generic || IDIOM_START.test(rest) || NOT_MUSIC.test(rest)) return null;

  // "X by Y": the artist ranks the results (the search uses both).
  let title = rest;
  let artist = '';
  if (kind === 'artist') {
    artist = rest;
    title = '';
  } else {
    const by = / by (?!.* by )(.+)$/.exec(rest);
    if (by && by.index > 0) {
      const who = by[1].trim();
      if (who && !PRONOUN_ARTIST.has(who) && who.split(' ').length <= 5) {
        title = rest.slice(0, by.index).trim();
        artist = who;
      }
    }
  }
  if (kind !== 'artist' && kind !== 'playlist' && (!title || (isGeneric(title) && !artist))) return null;
  if (loose && !apple && kind === 'song' && !artist && !/^(?:the |a |that |this )?(?:song|track|single|tune)\b/.test(norm.slice(norm.indexOf(' ') + 1))) return null;
  if (kind === 'artist' && HOUSEHOLD.test(artist)) return null;
  const query = [title, artist].filter(Boolean).join(' ');
  if (!query || query.length > 120) return null;
  return { action, kind, query, title, artist, apple, text: norm };
}

/** Words that may be a music command ("play …", "stop the music"): a cheap check before matching. */
export function looksLikeMusic(text) {
  return /\b(?:play|put on|hear|listen|preview|apple music|itunes|music|song|album|playlist)\b/i.test(String(text || ''));
}
