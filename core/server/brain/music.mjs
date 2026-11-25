// The briefing's music suggestion: one calm morning album a day, as an Apple Music search link (free,
// nothing to sign in to). The pick rotates with the date.

const PICKS = Object.freeze([
  ['Nils Frahm', 'Says'],
  ['Norah Jones', 'Come Away with Me'],
  ['Bill Evans Trio', 'Waltz for Debby'],
  ['Ólafur Arnalds', 're:member'],
  ['Khruangbin', 'Con Todo El Mundo'],
  ['Max Richter', 'The Four Seasons Recomposed'],
  ['Miles Davis', 'Kind of Blue'],
  ['Bon Iver', 'For Emma, Forever Ago'],
  ['Erik Satie', 'Gymnopédies'],
  ['Fleetwood Mac', 'Rumours'],
  ['Chet Baker', 'Chet Baker Sings'],
  ['Brian Eno', 'Music for Airports'],
  ['Fleet Foxes', 'Helplessness Blues'],
  ['Ludovico Einaudi', 'Islands'],
  ['Stan Getz & João Gilberto', 'Getz/Gilberto'],
  ['Hania Rani', 'Esja'],
  ['Simon & Garfunkel', 'Bridge over Troubled Water'],
  ['Yo-Yo Ma', 'Bach: The Cello Suites'],
  ['Vince Guaraldi Trio', 'Jazz Impressions of Black Orpheus'],
  ['Sade', 'Diamond Life'],
  ['Debussy', 'Clair de Lune'],
]);

/** { suggestion, appleMusicUrl } for a local date "2026-11-25". */
export function musicFor(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const n = Number.isFinite(y) ? Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000) : 0;
  const [artist, album] = PICKS[((n % PICKS.length) + PICKS.length) % PICKS.length];
  return {
    suggestion: `${album}, by ${artist}`,
    appleMusicUrl: `https://music.apple.com/us/search?term=${encodeURIComponent(`${artist} ${album}`)}`,
  };
}
