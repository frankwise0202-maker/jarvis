// Fixture data for the home base brain (Jarvis Core 1.1.0), in the shapes of the Core's contract
// (GET api/brain, api/jobs, api/watchers, api/briefing and the stream's job/watcher/spend/briefing
// frames). Presets cover what the dashboard must show: a working brain, no key, over the cap, the
// SDK missing, no location (no weather), a long headline list, no briefing yet, and an old Core
// without a brain at all (`none`: api/brain answers 404).

export const BRAIN_PRESETS = ['none', 'ok', 'nokey', 'overcap', 'sdk', 'noweather', 'long', 'waiting', 'full', 'busy', 'night', 'night2'];

const iso = (ms) => new Date(ms).toISOString();
const HOUR = 3600000;

/** "2026-11-25" in a time zone. */
function dayOf(ms, timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(ms));
}

const HEADLINES = [
  { title: 'Markets steady ahead of the holiday as investors weigh new jobs data', source: 'Reuters', url: 'https://example.com/news/1' },
  { title: 'NASA sets new date for the next crewed lunar flyby', source: 'AP News', url: 'https://example.com/news/2' },
  { title: 'Apple ships iOS 26.2 with new Home Screen widgets', source: 'The Verge', url: 'https://example.com/news/3' },
  { title: 'Thanksgiving travel: record crowds expected at airports today', source: 'NPR', url: 'https://example.com/news/4' },
  { title: 'Researchers show a battery that charges in five minutes', source: 'Ars Technica', url: 'https://example.com/news/5' },
  { title: 'City council approves new bike lanes downtown', source: 'BBC News', url: 'https://example.com/news/6' },
];

const LONG_HEADLINES = [
  { title: 'Global leaders gather for a second day of climate talks as negotiators work through the night on a draft agreement covering finance, adaptation and the phase-down of coal power plants', source: 'The Associated Press', url: 'https://example.com/long/1' },
  { title: 'Chipmaker announces a new generation of energy-efficient processors for laptops, promising all-day battery life and twice the graphics performance of last year’s models', source: 'Tom’s Hardware', url: 'https://example.com/long/2' },
  { title: 'Severe weather warnings issued across three states as a powerful storm system brings heavy rain, strong winds and the possibility of tornadoes through Thursday', source: 'National Weather Service', url: 'https://example.com/long/3' },
  { title: 'Streaming services raise prices again: what the changes mean for your monthly subscriptions and how to save', source: 'The New York Times', url: 'https://example.com/long/4' },
  { title: 'Scientists sequence the genome of a 40,000-year-old woolly mammoth preserved in Siberian permafrost', source: 'Nature News', url: 'https://example.com/long/5' },
  { title: 'Open-source community releases a long-awaited update to the Linux kernel with improved support for older NVIDIA graphics cards', source: 'Phoronix', url: 'https://example.com/long/6' },
];

/** The brain's state at simulated time `now` for a preset: { brain, jobs, watchers, briefing } (null brain: no brain). */
export function makeBrain(preset = 'ok', now = Date.parse('2026-11-25T07:00:00Z'), { timeZone = 'UTC', ownerName = 'Frank' } = {}) {
  if (preset === 'none') return { brain: null, jobs: [], watchers: [], briefing: null };
  const p = BRAIN_PRESETS.includes(preset) ? preset : 'ok';
  const keySet = p !== 'nokey';
  const sdk = p !== 'sdk';
  const located = p !== 'noweather';
  const today = p === 'overcap' ? 5.03 : p === 'nokey' ? 0 : p === 'busy' ? 4.21 : 0.42;
  const month = p === 'overcap' ? 31.4 : p === 'nokey' ? 0 : p === 'busy' ? 22.8 : 3.1;
  const brain = {
    version: '1.1.0',
    key: keySet ? { set: true, hint: '…Ab3D', setAt: iso(now - 30 * HOUR), verified: true } : { set: false, hint: null, setAt: null, verified: null },
    sdk: { installed: sdk },
    limits: { dailyUsd: 5, monthlyUsd: 50 },
    spend: { day: dayOf(now, timeZone), todayUsd: today, month: dayOf(now, timeZone).slice(0, 7), monthUsd: month, capReached: p === 'overcap' ? 'daily' : null },
    push: { vapidPublicKey: 'BFakeKeyForTests', devices: [{ id: 'p_1', label: 'iPhone', addedAt: iso(now - 40 * HOUR) }] },
    briefing: { enabled: true, time: '07:00', units: 'F', location: located ? { label: 'Your location', lat: 40.71, lon: -74.01 } : null, lastAt: p === 'waiting' ? null : iso(now), nextAt: iso(now + 24 * HOUR) },
    jobs: { running: p === 'busy' ? 1 : 0, queued: p === 'busy' ? 1 : 0 },
    watchers: { active: keySet ? 2 : 0 },
    owner: { name: ownerName },
  };
  const jobs = !keySet
    ? []
    : [
        ...(p === 'busy'
          ? [
              { id: 'j_6', kind: 'research', title: 'Compare the best robot vacuums for pet hair under $400', prompt: '…', depth: 'deep', status: 'running', createdAt: iso(now - 0.2 * HOUR), startedAt: iso(now - 0.15 * HOUR), finishedAt: null, costUsd: 0.31, summary: '', error: null },
              { id: 'j_7', kind: 'research', title: 'Weekend trip ideas within three hours of home', prompt: '…', depth: 'quick', status: 'queued', createdAt: iso(now - 0.1 * HOUR), startedAt: null, finishedAt: null, costUsd: 0, summary: '', error: null },
            ]
          : []),
        { id: 'j_5', kind: 'research', title: 'Best 27-inch monitor for a Mac and a PC under $400', prompt: '…', depth: 'deep', status: 'done', createdAt: iso(now - 7.5 * HOUR), startedAt: iso(now - 7.4 * HOUR), finishedAt: iso(now - 7.1 * HOUR), costUsd: 0.84, summary: 'The LG 27GP850 is the pick: 1440p at 165 Hz, USB-C to the Mac, about $330 at three stores.', error: null },
        { id: 'j_w1', kind: 'watch-check', title: 'Check: LG 27GP850 under $300', prompt: '…', depth: null, status: 'done', createdAt: iso(now - 3 * HOUR), startedAt: iso(now - 3 * HOUR), finishedAt: iso(now - 3 * HOUR), costUsd: 0.02, summary: 'Met', error: null },
        { id: 'j_4', kind: 'research', title: 'How to keep basil alive indoors over winter', prompt: '…', depth: 'quick', status: 'done', createdAt: iso(now - 9 * HOUR), startedAt: iso(now - 9 * HOUR), finishedAt: iso(now - 8.9 * HOUR), costUsd: 0.06, summary: 'A south window, water when the top inch is dry, pinch the flowers.', error: null },
        { id: 'j_3', kind: 'research', title: 'Flights to Lisbon in March', prompt: '…', depth: 'quick', status: p === 'overcap' ? 'blocked' : 'failed', createdAt: iso(now - 26 * HOUR), startedAt: iso(now - 26 * HOUR), finishedAt: iso(now - 26 * HOUR), costUsd: 0.01, summary: '', error: p === 'overcap' ? { code: 'spend_cap', message: 'Daily spending cap reached ($5).' } : { code: 'api_error', message: 'The Claude API did not answer.' } },
        { id: 'j_2', kind: 'research', title: 'Is the GTX 970 still fine for 1080p gaming?', prompt: '…', depth: 'quick', status: 'done', createdAt: iso(now - 50 * HOUR), startedAt: iso(now - 50 * HOUR), finishedAt: iso(now - 50 * HOUR), costUsd: 0.05, summary: 'Yes for older and lighter games at medium settings.', error: null },
        { id: 'j_1', kind: 'research', title: 'Quiet mechanical keyboards', prompt: '…', depth: 'quick', status: 'cancelled', createdAt: iso(now - 80 * HOUR), startedAt: null, finishedAt: iso(now - 80 * HOUR), costUsd: 0, summary: '', error: null },
      ];
  const watchers = !keySet
    ? []
    : [
        { id: 'w_1', what: 'LG 27GP850 under $300', every: '6h', status: 'met', createdAt: iso(now - 30 * HOUR), lastCheckAt: iso(now - 3 * HOUR), nextCheckAt: null, lastResult: { met: true, summary: 'Down to $289 at Best Buy (was $329).', sources: [] }, costUsd: 0.08 },
        { id: 'w_2', what: 'Tickets for the Philharmonic holiday concert', every: '12h', status: 'watching', createdAt: iso(now - 20 * HOUR), lastCheckAt: iso(now - 5 * HOUR), nextCheckAt: iso(now + 7 * HOUR), lastResult: { met: false, summary: 'Not on sale yet.', sources: [] }, costUsd: 0.04 },
        { id: 'w_3', what: 'A new firmware for the Alienware', every: '24h', status: 'watching', createdAt: iso(now - 70 * HOUR), lastCheckAt: iso(now - 20 * HOUR), nextCheckAt: iso(now + 4 * HOUR), lastResult: null, costUsd: 0.02 },
      ];
  const briefing = p === 'waiting' ? null : makeBriefing(p, now, { timeZone, ownerName, keySet, located });
  return { brain, jobs, watchers, briefing };
}

export function makeBriefing(p, now, { timeZone = 'UTC', ownerName = 'Frank', keySet = true, located = true } = {}) {
  const full = p === 'full';
  return {
    date: dayOf(now, timeZone),
    generatedAt: iso(now),
    kind: full ? 'full' : 'free',
    greeting: `Good morning, ${ownerName}.`,
    weather: located ? { label: 'Your location', units: 'F', now: { temp: 41, summary: 'Partly cloudy', code: 2 }, today: { high: 52, low: 38, rainChancePct: 20, summary: 'Partly cloudy, a light breeze' } } : null,
    headlines: p === 'long' ? LONG_HEADLINES : HEADLINES,
    // `night`: a busy night (the most the Core sends): five research results (one failed), three
    // met watchers and the overnight report's six notes at their real length. `night2`: the same
    // night with two research results and no watcher (the roomier layout at its longest).
    homebase:
      p === 'night' || p === 'night2'
        ? { level: 'ok', summary: 'All clear now, after 2 things overnight.', notes: ['2:14 AM: The computer started at 2:13 AM (it had stopped unexpectedly)', '3:02 AM: Internet down: no answer from the gateway for 4 minutes', '6:40 AM: Jarvis Core updated itself to 3f9c2a1 (from c0d5801)', 'CPU peaked at 97% at 6:41 AM', 'Warmest CPU reading 71 °C at 6:41 AM', 'Graphics card peaked at 58 °C'] }
        : { level: 'ok', summary: 'All systems normal overnight.', notes: ['CPU peaked at 12% at 3:10 AM', 'Warmest CPU reading 48 °C at 3:10 AM', 'No restarts overnight'] },
    jobs:
      p === 'night' || p === 'night2'
        ? [1, 2, 3, 4, 5].slice(0, p === 'night2' ? 2 : 5).map((i) => ({ id: `j_n${i}`, title: `Overnight research number ${i}: compare the best options and prices for a quiet mechanical keyboard`, status: i === 3 ? 'failed' : 'done', summary: 'A long one-line summary of what the research found, with the top pick, the price and where to buy it today.' }))
        : keySet
          ? [{ id: 'j_5', title: 'Best 27-inch monitor for a Mac and a PC under $400', status: 'done', summary: 'The LG 27GP850 is the pick: 1440p at 165 Hz, USB-C to the Mac, about $330.' }]
          : [],
    watchers:
      p === 'night' || p === 'night2'
        ? [1, 2, 3].slice(0, p === 'night2' ? 0 : 3).map((i) => ({ id: `w_n${i}`, what: `Watcher ${i}: the LG 27GP850 monitor under $300 at a big store`, status: 'met', summary: 'Down to $289 at Best Buy (was $329), in stock for pickup today.' }))
        : keySet
          ? [{ id: 'w_1', what: 'LG 27GP850 under $300', status: 'met', summary: 'Down to $289 at Best Buy (was $329).' }]
          : [],
    whatsNew: [
      { title: 'The home base works while you sleep', detail: 'Ask it to research something; the answer waits on your phone.' },
      { title: 'Watchers', detail: 'Say “tell me when…” and Jarvis checks for you.' },
    ],
    music: { suggestion: 'Norah Jones, “Come Away With Me” — an easy start to a Wednesday.', appleMusicUrl: 'https://music.apple.com/us/search?term=norah%20jones' },
    markdown: '',
    spoken: full
      ? `Good morning, ${ownerName}. A crisp, partly cloudy start at 41 degrees, rising to 52 this afternoon. The markets are calm before the holiday and NASA has a new date for its lunar flyby. Rather good news on the monitor front: the LG you were watching is down to $289. The home base had a quiet night.`
      : `Good morning, ${ownerName}. It's Wednesday, November 25.`,
  };
}
