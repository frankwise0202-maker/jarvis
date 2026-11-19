// Demo mode (?demo=1): a scripted stand-in for the engine with the same public API as
// createJarvis(), plus an in-memory conversation store. It plays a realistic showcase
// (a Kyoto trip planned by an 8-agent swarm) and answers anything typed with a short,
// clearly labelled simulation. It never calls the API and never touches saved data.

const WIKI = (slug, title) => ({ url: `https://en.wikipedia.org/wiki/${slug}`, title: `${title} — Wikipedia` });

const SRC = {
  blossom: WIKI('Cherry_blossom', 'Cherry blossom'),
  hanami: WIKI('Hanami', 'Hanami'),
  kyoto: WIKI('Kyoto', 'Kyoto'),
  maruyama: WIKI('Maruyama_Park', 'Maruyama Park'),
  philosopher: WIKI('Philosopher%27s_Walk', 'Philosopher’s Walk'),
  gion: WIKI('Gion', 'Gion'),
  ryokan: WIKI('Ryokan', 'Ryokan'),
  kaiseki: WIKI('Kaiseki', 'Kaiseki'),
  nishiki: WIKI('Nishiki_Market', 'Nishiki Market'),
  icoca: WIKI('ICOCA', 'ICOCA'),
  jrpass: WIKI('Japan_Rail_Pass', 'Japan Rail Pass'),
  nara: WIKI('Nara,_Nara', 'Nara'),
  uji: WIKI('Uji,_Kyoto', 'Uji'),
  inari: WIKI('Fushimi_Inari-taisha', 'Fushimi Inari-taisha'),
  kiyomizu: WIKI('Kiyomizu-dera', 'Kiyomizu-dera'),
  arashiyama: WIKI('Arashiyama', 'Arashiyama'),
  todaiji: WIKI('T%C5%8Ddai-ji', 'Tōdai-ji'),
  byodoin: WIKI('By%C5%8Dd%C5%8D-in', 'Byōdō-in'),
  pontocho: WIKI('Pontoch%C5%8D', 'Pontochō'),
  nanzenji: WIKI('Nanzen-ji', 'Nanzen-ji'),
  jnto: { url: 'https://www.jnto.go.jp/', title: 'Japan National Tourism Organization' },
  japanGuide: { url: 'https://www.japan-guide.com/', title: 'japan-guide.com — Japan travel guide' },
  jma: { url: 'https://www.data.jma.go.jp/', title: 'Japan Meteorological Agency' },
};

export const SHOWCASE_PROMPT =
  'Plan a 5-day Kyoto trip for two in early April: cherry blossoms, great food and one day trip, under $3,000 on the ground. And remember that we hate crowds.';

const SHOWCASE_AGENTS = [
  {
    codename: 'Atlas',
    role: 'Bloom timing analyst',
    task: 'Determine when Kyoto’s cherry blossoms typically reach full bloom in early April, how long the peak lasts, and which viewing spots bloom earlier or later. Recommend the best 5-day window and a backup plan if the bloom is early or late.',
    queries: ['Kyoto cherry blossom full bloom average date', 'Kyoto late blooming cherry blossom spots'],
    fetch: SRC.blossom,
    pool: [SRC.blossom, SRC.hanami, SRC.maruyama, SRC.kyoto, SRC.philosopher, SRC.jma],
    thinking: 'Start with the historical bloom pattern for Kyoto, then find spots that bloom later so the plan still works if the main peak comes early.',
    report:
      '## Key findings\n- Full bloom in Kyoto usually falls between **late March and early April**, and the best viewing lasts about a week ([source](https://en.wikipedia.org/wiki/Cherry_blossom)).\n- The weeping cherry in [Maruyama Park](https://en.wikipedia.org/wiki/Maruyama_Park) tends to open first; northern and hillside areas bloom later.\n- Hanami crowds peak on weekends at the famous spots ([source](https://en.wikipedia.org/wiki/Hanami)).\n\n## Confidence and gaps\nHigh on the typical window. Exact dates depend on the official forecast, published in late winter.',
  },
  {
    codename: 'Nova',
    role: 'Lodging scout',
    task: 'Compare Gion/Higashiyama, Kawaramachi and Kyoto Station as bases for a couple in cherry blossom season. Include rough nightly prices for a comfortable hotel and one ryokan night, and when to book.',
    queries: ['Kyoto best area to stay first visit', 'Kyoto ryokan cherry blossom season price'],
    fetch: SRC.ryokan,
    pool: [SRC.gion, SRC.ryokan, SRC.kyoto, SRC.japanGuide, SRC.jnto],
    thinking: 'Weigh walkability to the eastern temples against transit convenience, then check how far ahead spring rooms sell out.',
    report:
      '## Key findings\n- **Gion / Higashiyama** puts you within walking distance of the eastern temples and the Philosopher’s Path ([source](https://en.wikipedia.org/wiki/Gion)).\n- **Kawaramachi** is central with easy bus and train links; **Kyoto Station** suits day trips best.\n- Spring is peak season: book 3–4 months ahead, with free cancellation.\n- A night in a traditional [ryokan](https://en.wikipedia.org/wiki/Ryokan), dinner included, is a highlight worth the premium.\n\n## Confidence and gaps\nPrices swing sharply by date, so treat ranges as rough.',
  },
  {
    codename: 'Echo',
    role: 'Food critic',
    task: 'Recommend where and what to eat in Kyoto for two food lovers: one special kaiseki dinner, Nishiki Market, casual local favorites, and how to avoid queues.',
    queries: ['Kyoto kaiseki dinner reservation tips', 'Nishiki Market best time to visit'],
    fetch: SRC.nishiki,
    pool: [SRC.kaiseki, SRC.nishiki, SRC.pontocho, SRC.nanzenji, SRC.japanGuide],
    thinking: 'One splurge, one market morning, and a few easy local meals. Reservations are the main risk in spring.',
    report:
      '## Key findings\n- Book one **[kaiseki](https://en.wikipedia.org/wiki/Kaiseki)** dinner weeks ahead; lunch sets offer the same craft for less.\n- [Nishiki Market](https://en.wikipedia.org/wiki/Nishiki_Market) is best before 11 am, ahead of the tour groups.\n- [Pontochō](https://en.wikipedia.org/wiki/Pontoch%C5%8D) alley is atmospheric for dinner; reserve or arrive early.\n- Try yudofu (simmered tofu) near Nanzen-ji, and matcha sweets in Uji.\n\n## Confidence and gaps\nMany small restaurants close one weekday; check before you go.',
  },
  {
    codename: 'Vega',
    role: 'Transit planner',
    task: 'Find the simplest, cheapest way to get around Kyoto and to one day trip: IC cards, buses versus subway, whether a Japan Rail Pass is worth it, and the airport transfer from Kansai.',
    queries: ['ICOCA card Kyoto buses subway', 'Japan Rail Pass worth it Kyoto only trip'],
    fetch: SRC.icoca,
    pool: [SRC.icoca, SRC.jrpass, SRC.kyoto, SRC.japanGuide],
    thinking: 'Compare an IC card against passes for a Kyoto-based week with a single day trip.',
    report:
      '## Key findings\n- An [ICOCA](https://en.wikipedia.org/wiki/ICOCA) card covers the subway, most buses and JR trains: just tap in and out.\n- A [Japan Rail Pass](https://en.wikipedia.org/wiki/Japan_Rail_Pass) isn’t worth it for a Kyoto-only trip with one day trip.\n- Buses are packed in bloom season; pair the subway with walking.\n- From Kansai Airport, the Haruka limited express runs straight to Kyoto Station.\n\n## Confidence and gaps\nFares change; check current prices before you travel.',
  },
  {
    codename: 'Orion',
    role: 'Day-trip analyst',
    task: 'Compare Nara, Uji and Osaka as a single day trip from Kyoto in blossom season for a couple who dislike crowds. Recommend one, with timing.',
    queries: ['Nara day trip from Kyoto', 'Uji day trip Byodo-in matcha'],
    fetch: SRC.nara,
    pool: [SRC.nara, SRC.uji, SRC.todaiji, SRC.byodoin, SRC.jnto],
    thinking: 'Nara is the classic, Uji the quiet one. Crowd tolerance decides it.',
    report:
      '## Key findings\n- **[Nara](https://en.wikipedia.org/wiki/Nara,_Nara)** is under an hour by train: Tōdai-ji, the deer park and wide grounds that absorb crowds.\n- **[Uji](https://en.wikipedia.org/wiki/Uji,_Kyoto)** is quieter: Byōdō-in and riverside tea houses, ideal for a half day.\n- Osaka is better for food and nightlife than for blossoms.\n- Recommendation: Nara on a weekday, starting by 8:30 am.\n\n## Confidence and gaps\nWeekday versus weekend is the biggest crowd variable.',
  },
  {
    codename: 'Lyra',
    role: 'Crowd strategist',
    task: 'Build a crowd-avoidance plan for Kyoto’s most popular blossom and temple spots in early April: best times of day, quieter alternatives, and what to avoid on weekends.',
    queries: ['Kyoto avoid crowds cherry blossom early morning', 'Fushimi Inari early morning crowds'],
    fetch: SRC.inari,
    pool: [SRC.inari, SRC.arashiyama, SRC.kiyomizu, SRC.philosopher, SRC.hanami],
    thinking: 'Sequence the famous spots by when they are quietest, and keep one flexible slot for the best bloom.',
    report:
      '## Key findings\n- Visit the headline spots **before 8 am**: the [Arashiyama](https://en.wikipedia.org/wiki/Arashiyama) bamboo grove, [Kiyomizu-dera](https://en.wikipedia.org/wiki/Kiyomizu-dera) and the Philosopher’s Path.\n- [Fushimi Inari](https://en.wikipedia.org/wiki/Fushimi_Inari-taisha) is open around the clock; the upper trails thin out fast.\n- Evening illuminations draw big crowds; choose one, not several.\n- Quieter blossoms: the Okazaki canal and smaller temple gardens.\n\n## Confidence and gaps\nWeekends at full bloom are busy whatever the strategy.',
  },
  {
    codename: 'Juno',
    role: 'Budget analyst',
    task: 'Estimate a 5-day on-the-ground budget for two in Kyoto in blossom season (lodging, food, transit, entry fees, one ryokan night) and show how to stay under $3,000.',
    queries: ['Kyoto travel budget per day couple', 'Kyoto temple entrance fees'],
    fetch: SRC.kyoto,
    pool: [SRC.kyoto, SRC.ryokan, SRC.icoca, SRC.japanGuide],
    thinking: 'Lodging dominates. Cap the ryokan at one night and the rest falls into place.',
    report:
      '## Key findings\n- Lodging is the biggest line: three hotel nights plus one ryokan night take roughly half the budget.\n- Food for two runs about $130–$170 a day with one splurge dinner.\n- Transit and entry fees are modest: roughly $80–$120 a day for two, all in.\n- Estimated total: **$2,300–$2,900**, under the $3,000 target with a buffer.\n\n## Confidence and gaps\nExchange rates and peak-season room prices are the main uncertainties.',
  },
  {
    codename: 'Kepler',
    role: 'Etiquette & events',
    task: 'List blossom-season customs, temple etiquette and practical tips for Kyoto in early April: hanami manners, cash versus card, closures, and common first-timer mistakes.',
    queries: ['hanami etiquette tips', 'Kyoto temple etiquette for visitors'],
    fetch: SRC.hanami,
    pool: [SRC.hanami, SRC.gion, SRC.kyoto, SRC.jnto],
    thinking: 'Practical do’s and don’ts the owner would want before arriving.',
    report:
      '## Key findings\n- [Hanami](https://en.wikipedia.org/wiki/Hanami) picnics are welcome in parks; take your rubbish home.\n- Don’t pull or shake blossom branches, and stay on the paths in temple gardens.\n- Carry some cash: smaller temples and food stalls may not take cards.\n- In [Gion](https://en.wikipedia.org/wiki/Gion), don’t photograph people without permission.\n\n## Confidence and gaps\nEvent schedules are announced closer to the season.',
  },
];

const SHOWCASE_INTRO =
  'Noted — I’ll keep you well away from the crowds, sir. I’m deploying eight specialists to cover bloom timing, where to stay, food, transit, a day trip, crowd tactics, budget and etiquette.';

const SHOWCASE_SYNTH_THINKING =
  'All eight reports are in. They agree on the late-March to early-April window and on early starts to beat the crowds. Juno’s budget fits under $3,000 if the ryokan is limited to one night. Structure: plain summary, day-by-day table, bloom timing, crowd tactics, budget table, next step.';

const SHOWCASE_ANSWER = `Here is a calm, crowd-dodging five days in Kyoto for two, timed for peak bloom and comfortably under budget at roughly $2,300 to $2,900 on the ground. Stay in Higashiyama, see the famous spots before 8 am, and take Nara on a weekday.

## The plan
| Day | Focus | Highlights |
|:--|:--|:--|
| 1 | Arrive · Gion | Settle in, evening walk along the Shirakawa canal |
| 2 | Northern Higashiyama | Philosopher’s Path at 7 am, Nanzen-ji, yudofu lunch |
| 3 | Arashiyama | Bamboo grove at dawn, Tenryū-ji garden, river walk |
| 4 | Day trip · Nara | Tōdai-ji and the deer park, dinner in Pontochō |
| 5 | Fushimi Inari · Nishiki | Upper shrine trails early, Nishiki Market by 10 am |

## Bloom timing
Full bloom usually lands between late March and early April and lasts about a week ([Cherry blossom](https://en.wikipedia.org/wiki/Cherry_blossom)). Book refundable rooms now and fine-tune once the official forecast appears. If the peak comes early, the weeping cherry in [Maruyama Park](https://en.wikipedia.org/wiki/Maruyama_Park) opens first; northern spots bloom later.

## Avoiding the crowds
- Go **before 8 am** to the bamboo grove, Kiyomizu-dera and the Philosopher’s Path.
- [Fushimi Inari](https://en.wikipedia.org/wiki/Fushimi_Inari-taisha) never closes, and the upper trails are quiet.
- Choose **one** evening illumination rather than several.

## Budget for two (estimate)
| Item | Estimate |
|:--|--:|
| Hotel, 3 nights + ryokan, 1 night | $1,300–$1,550 |
| Food, with one kaiseki dinner | $650–$850 |
| Transit on ICOCA cards | $120–$180 |
| Entry fees and extras | $230–$320 |
| **Total** | **$2,300–$2,900** |

An [ICOCA](https://en.wikipedia.org/wiki/ICOCA) card covers buses, the subway and the train to Nara; skip the [Japan Rail Pass](https://en.wikipedia.org/wiki/Japan_Rail_Pass) for this trip.

## Next step
Shall I draft a booking checklist, starting with the ryokan and the kaiseki dinner?`;

const SHOWCASE_CITATIONS = [SRC.blossom, SRC.maruyama, SRC.inari, SRC.icoca, SRC.jrpass, SRC.nara, SRC.hanami, SRC.ryokan];

// ---- seeded conversations -----------------------------------------------------------

function seedConversations(now) {
  const min = 60000;
  const day = 86400000;
  const kyotoStart = now - 7 * min;

  const kyoto = baseConversation('demo-kyoto', 'When do Kyoto’s cherry blossoms usually peak?', kyotoStart);
  kyoto.turns.push(
    { id: 'demo-k-u1', role: 'user', text: 'When do Kyoto’s cherry blossoms usually peak?', mode: 'auto', createdAt: kyotoStart },
    doneTurn('demo-k-j1', kyotoStart + 400, 14200, 'auto', 'claude-opus-5-5', [
      {
        id: 'demo-k-s1',
        kind: 'thinking',
        req: 0,
        text: 'The owner wants the typical peak bloom window for Kyoto. Bloom dates shift each year with spring temperatures, so I should check the usual pattern rather than give one fixed date, then answer briefly with the window, how long it lasts, and where to see it.',
        startedAt: kyotoStart + 600,
        endedAt: kyotoStart + 6600,
      },
      {
        id: 'demo-k-s2',
        kind: 'tool',
        tool: 'web_search',
        query: 'Kyoto cherry blossom peak bloom typical dates',
        url: '',
        status: 'done',
        results: [SRC.blossom, SRC.hanami, SRC.kyoto, SRC.japanGuide, SRC.jnto, SRC.philosopher, SRC.maruyama, SRC.jma],
        errorCode: null,
        req: 0,
      },
      {
        id: 'demo-k-s3',
        kind: 'text',
        req: 0,
        text:
          'Kyoto’s cherry blossoms usually reach full bloom in late March or the first days of April, and the best viewing lasts about a week before the petals fall.\n\n- **Typical peak:** the end of March to early April, shifting a few days each year with spring temperatures.\n- **Best spots:** the [Philosopher’s Path](https://en.wikipedia.org/wiki/Philosopher%27s_Walk), [Maruyama Park](https://en.wikipedia.org/wiki/Maruyama_Park) and the Kamo River banks.\n- **Plan tip:** forecasts firm up in late winter, so book flexible rooms.\n\nWould you like me to plan a trip around it?',
        citations: [SRC.blossom, SRC.hanami, SRC.philosopher, SRC.maruyama, SRC.japanGuide],
      },
    ], { agents: 0, searches: 1, sources: 8, waves: 0 }, 0.031),
  );
  kyoto.updatedAt = kyotoStart + 14600;

  const heat = baseConversation('demo-heat', 'How do heat pumps work in really cold weather?', now - day - 3 * 3600000);
  heat.turns.push(
    { id: 'demo-h-u1', role: 'user', text: 'How do heat pumps work in really cold weather?', mode: 'quick', createdAt: heat.createdAt },
    doneTurn('demo-h-j1', heat.createdAt + 300, 9100, 'quick', 'claude-opus-5-5', [
      {
        id: 'demo-h-s1',
        kind: 'text',
        req: 0,
        text:
          'A heat pump moves heat rather than making it, and even freezing outdoor air still holds usable heat; modern cold-climate models keep working well below zero, just less efficiently.\n\n- **How:** a refrigerant boils at very low temperatures, absorbs heat outside, is compressed to raise its temperature, then releases that heat indoors.\n- **In the cold:** efficiency falls as the gap between indoor and outdoor temperature grows, but cold-climate units still deliver more heat than the electricity they use for most of the winter.\n- **Defrost:** the outdoor coil periodically warms itself to shed frost; brief pauses are normal.\n\nIf you tell me your climate and home size, I can estimate whether a backup heat source is worth having.',
        citations: [],
      },
    ], { agents: 0, searches: 0, sources: 0, waves: 0 }, 0.012),
  );
  heat.updatedAt = heat.createdAt + 9600;

  const toast = baseConversation('demo-toast', 'Help me write a short toast for my sister’s wedding', now - 4 * day);
  toast.turns.push(
    { id: 'demo-t-u1', role: 'user', text: 'Help me write a short toast for my sister’s wedding. She’s an architect and he’s a chef.', mode: 'auto', createdAt: toast.createdAt },
    doneTurn('demo-t-j1', toast.createdAt + 300, 7800, 'auto', 'claude-opus-5-5', [
      {
        id: 'demo-t-s1',
        kind: 'text',
        req: 0,
        text:
          'Here is a warm, one-minute toast you can make your own.\n\n> Good evening, everyone. For those who don’t know me, I’m the bride’s sibling — which means I’ve watched her design beautiful things my whole life. Tonight she’s finally built something with a partner who can keep up: a chef who knows that the best things take patience, good ingredients and a little heat.\n>\n> So here’s to a marriage with strong foundations and a full table. To the happy couple!\n\nWant a funnier version, or one with a short story about the two of you growing up?',
        citations: [],
      },
    ], { agents: 0, searches: 0, sources: 0, waves: 0 }, 0.009),
  );
  toast.updatedAt = toast.createdAt + 8100;

  const funds = baseConversation('demo-funds', 'Index funds versus target-date funds — which suits me?', now - 12 * day);
  funds.turns.push(
    { id: 'demo-f-u1', role: 'user', text: 'Index funds versus target-date funds — which suits a hands-off saver?', mode: 'quick', createdAt: funds.createdAt },
    doneTurn('demo-f-j1', funds.createdAt + 300, 8400, 'quick', 'claude-opus-5-5', [
      {
        id: 'demo-f-s1',
        kind: 'text',
        req: 0,
        text:
          'For a truly hands-off saver, a low-cost target-date fund is usually the simplest choice; a handful of index funds can be cheaper but needs occasional rebalancing.\n\n| | Target-date fund | DIY index funds |\n|:--|:--|:--|\n| Effort | Set and forget | Rebalance yearly |\n| Mix | Shifts to bonds as the date nears | You choose |\n| Cost | Low to moderate | Lowest |\n\nThis is general information, not personal advice; check fees before you choose.',
        citations: [],
      },
    ], { agents: 0, searches: 0, sources: 0, waves: 0 }, 0.01),
  );
  funds.updatedAt = funds.createdAt + 8800;

  return [kyoto, heat, toast, funds];
}

function baseConversation(id, title, createdAt) {
  return { id, v: 1, title: title.slice(0, 60), createdAt, updatedAt: createdAt, system: 'demo', tools: [], apiMessages: [], turns: [], pending: null };
}

function doneTurn(id, createdAt, durationMs, mode, leadModel, segments, stats, costUsd) {
  return {
    id,
    role: 'jarvis',
    createdAt,
    endedAt: createdAt + durationMs,
    status: 'done',
    mode,
    leadModel,
    workerModel: 'claude-sonnet-5-5',
    depth: 'balanced',
    segments,
    missions: {},
    usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: stats.searches || 0, fetches: 0 },
    costUsd,
    stats: { ...stats, durationMs },
    error: null,
  };
}

// ---- engine stand-in ----------------------------------------------------------------

let idSeq = 0;
const newId = (p) => `${p}-${Date.now().toString(36)}-${(++idSeq).toString(36)}`;

function createEmitter() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    emit(type, payload = {}) {
      const event = { ...payload, type };
      for (const key of [type, '*']) {
        const set = listeners.get(key);
        if (!set) continue;
        for (const fn of Array.from(set)) {
          try {
            fn(event, type);
          } catch (err) {
            console.error(`[jarvis demo] "${type}" listener failed:`, err);
          }
        }
      }
    },
  };
}

/** Timers that all stop together; delays are divided by `speed`. */
function createScheduler(speed) {
  const timers = new Set();
  let stopped = false;
  return {
    after(ms, fn) {
      if (stopped) return;
      const id = setTimeout(() => {
        timers.delete(id);
        if (!stopped) fn();
      }, Math.max(0, ms / speed));
      timers.add(id);
    },
    stop() {
      stopped = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
    get stopped() {
      return stopped;
    },
  };
}

/** Split text into natural-looking streaming chunks (a few words each). */
function chunk(text) {
  const parts = text.match(/\S+\s*|\s+/g) || [];
  const out = [];
  let buf = '';
  let target = 2 + Math.floor(Math.random() * 3);
  for (const p of parts) {
    buf += p;
    if (--target <= 0) {
      out.push(buf);
      buf = '';
      target = 2 + Math.floor(Math.random() * 3);
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * @param {{ speed?: number, getSettings?: () => object }} [opts]
 */
export function createDemo(opts = {}) {
  const speed = Math.min(8, Math.max(0.25, Number(opts.speed) || 1));
  const getSettings = opts.getSettings || (() => ({}));
  const store = new Map();
  for (const conv of seedConversations(Date.now())) store.set(conv.id, conv);
  const active = new Map(); // convId -> run

  // ---- store (same shape as platform/db.js) ----
  const demoStore = {
    async list() {
      return Array.from(store.values())
        .filter((c) => c.turns.length)
        .map((c) => {
          const users = c.turns.filter((t) => t.role === 'user');
          const last = users[users.length - 1];
          return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, preview: last ? String(last.text).slice(0, 120) : '', turnCount: c.turns.length };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async get(id) {
      return store.get(id) || null;
    },
    async save(conv) {
      if (conv && conv.id) store.set(conv.id, conv);
    },
    async remove(id) {
      store.delete(id);
    },
    async removeAll() {
      store.clear();
    },
    isPersistent: () => true,
  };

  // ---- engine API ----
  function newConversation() {
    const now = Date.now();
    return { id: newId('demo-conv'), v: 1, title: '', createdAt: now, updatedAt: now, system: 'demo', tools: [], apiMessages: [], turns: [], pending: null };
  }

  function startTurn(conv, { text, mode = 'auto', attachments } = {}) {
    if (active.has(conv.id)) throw new Error('A turn is already running for this conversation.');
    const s = getSettings() || {};
    const now = Date.now();
    const userTurn = { id: newId('u'), role: 'user', text: String(text || ''), mode, createdAt: now };
    // Like the engine (SPEC §15.1): keep display metadata only, never the file data.
    const files = Array.isArray(attachments) ? attachments.filter((a) => a && typeof a === 'object') : [];
    if (files.length) userTurn.attachments = files.map(({ id, kind, name, mediaType, size, thumb, width, height }) => ({ id, kind, name, mediaType, size, thumb, width, height }));
    const turn = {
      id: newId('j'),
      role: 'jarvis',
      createdAt: now,
      endedAt: null,
      status: 'running',
      mode,
      leadModel: s.leadModel || 'claude-opus-5-5',
      workerModel: s.workerModel || 'claude-sonnet-5-5',
      depth: s.depth || 'balanced',
      segments: [],
      missions: {},
      usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 },
      costUsd: 0,
      stats: { agents: 0, searches: 0, sources: 0, waves: 0, durationMs: 0 },
      error: null,
    };
    conv.turns.push(userTurn, turn);
    if (!conv.title) conv.title = (userTurn.text.replace(/\s+/g, ' ').trim() || (files.length ? `Shared ${files.length} file${files.length === 1 ? '' : 's'}` : '')).slice(0, 60);
    conv.updatedAt = now;

    const run = createRun(conv, turn);
    active.set(conv.id, run);
    const showcase = userTurn.text === SHOWCASE_PROMPT;
    const topic = userTurn.text || (files.length > 1 ? 'the files you shared' : files.length ? 'the file you shared' : 'your message');
    // Let the caller subscribe before the first event.
    setTimeout(() => {
      run.emit('turn', { turn });
      if (showcase) playShowcase(run);
      else if (mode === 'swarm') playGenericSwarm(run, topic, Math.min(6, Math.max(3, Number(s.maxAgents) || 5)));
      else playGenericAnswer(run, topic);
    }, 0);
    return run.api;
  }

  function createRun(conv, turn) {
    const emitter = createEmitter();
    const sched = createScheduler(speed);
    let resolveDone;
    const done = new Promise((r) => (resolveDone = r));
    let finished = false;

    const run = {
      conv,
      turn,
      sched,
      emit: emitter.emit,
      addSegment(seg) {
        const segment = { id: newId('seg'), ...seg };
        turn.segments.push(segment);
        emitter.emit('segment', { turn, segment });
        return segment;
      },
      touch(segment) {
        emitter.emit('segment', { turn, segment });
      },
      stream(segment, text, ms, after) {
        const parts = chunk(text);
        const step = ms / Math.max(1, parts.length);
        parts.forEach((p, i) => {
          sched.after(step * (i + 1), () => {
            segment.text += p;
            emitter.emit('segment', { turn, segment });
            if (i === parts.length - 1 && after) after();
          });
        });
        if (!parts.length && after) sched.after(0, after);
      },
      addCost(usd, usage = {}) {
        turn.costUsd = Math.round((turn.costUsd + usd) * 1e6) / 1e6;
        for (const k of Object.keys(usage)) turn.usage[k] = (turn.usage[k] || 0) + usage[k];
        emitter.emit('usage', { turn });
      },
      finish(status = 'done') {
        if (finished) return;
        finished = true;
        sched.stop();
        const now = Date.now();
        turn.status = status;
        turn.endedAt = now;
        const missions = Object.values(turn.missions);
        const agents = missions.flatMap((m) => m.agents);
        const urls = new Set();
        for (const seg of turn.segments) {
          if (seg.kind === 'tool') for (const r of seg.results || []) urls.add(r.url);
          if (seg.kind === 'text') for (const r of seg.citations || []) urls.add(r.url);
        }
        for (const a of agents) for (const src of a.sources) urls.add(src.url);
        turn.stats = {
          agents: agents.length,
          searches: agents.reduce((n, a) => n + a.searches.length, 0) + turn.segments.filter((s) => s.kind === 'tool' && s.tool === 'web_search').length,
          sources: urls.size,
          waves: missions.length,
          durationMs: now - turn.createdAt,
        };
        conv.updatedAt = now;
        active.delete(conv.id);
        demoStore.save(conv);
        emitter.emit('turn', { turn });
        emitter.emit('end', { turn });
        resolveDone(turn);
      },
    };

    run.api = {
      conversation: conv,
      turn,
      on: emitter.on,
      done,
      abort() {
        if (finished) return;
        sched.stop();
        const now = Date.now();
        for (const seg of turn.segments) {
          if (seg.kind === 'thinking' && !seg.endedAt) seg.endedAt = now;
          if (seg.kind === 'tool' && seg.status === 'running') seg.status = 'error';
        }
        for (const m of Object.values(turn.missions)) {
          for (const a of m.agents) {
            if (!['done', 'error'].includes(a.status)) {
              a.status = 'stopped';
              a.activity = 'Stopped by the owner';
              a.endedAt = now;
              emitter.emit('agent', { turn, mission: m, agent: a });
            }
          }
          if (['planning', 'running'].includes(m.status)) {
            m.status = 'stopped';
            m.endedAt = now;
            emitter.emit('mission', { turn, mission: m });
          }
        }
        run.finish('stopped');
      },
    };
    return run;
  }

  // ---- scripts ----
  function newMission(run, title, specs) {
    const mission = { id: newId('m'), wave: Object.keys(run.turn.missions).length + 1, title: '', toolUseId: newId('toolu'), createdAt: Date.now(), startedAt: null, endedAt: null, status: 'planning', agents: [] };
    run.turn.missions[mission.id] = mission;
    run.addSegment({ kind: 'mission', missionId: mission.id, req: 1 });
    run.emit('mission', { turn: run.turn, mission });
    // Title, then agents appear one by one as the plan "streams".
    run.sched.after(300, () => {
      mission.title = title;
      run.emit('mission', { turn: run.turn, mission });
    });
    specs.forEach((spec, i) => {
      run.sched.after(520 + i * 230, () => {
        mission.agents.push({
          id: newId('a'),
          codename: spec.codename,
          role: spec.role,
          task: spec.task,
          web: true,
          model: run.turn.workerModel,
          status: 'queued',
          activity: 'Queued',
          thinking: '',
          report: '',
          sources: [],
          searches: [],
          fetches: [],
          usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 },
          costUsd: 0,
          attempts: 0,
          startedAt: null,
          endedAt: null,
          error: null,
        });
        run.emit('mission', { turn: run.turn, mission });
      });
    });
    return mission;
  }

  function runMission(run, mission, specs, parallel, onDone) {
    mission.status = 'running';
    mission.startedAt = Date.now();
    run.emit('mission', { turn: run.turn, mission });
    let next = 0;
    let running = 0;
    let finished = 0;
    const launch = () => {
      while (running < parallel && next < mission.agents.length) {
        const agent = mission.agents[next];
        const spec = specs[next];
        next += 1;
        running += 1;
        runAgent(run, mission, agent, spec, () => {
          running -= 1;
          finished += 1;
          if (finished === mission.agents.length) {
            mission.status = 'done';
            mission.endedAt = Date.now();
            run.emit('mission', { turn: run.turn, mission });
            onDone();
          } else launch();
        });
      }
    };
    launch();
  }

  function runAgent(run, mission, agent, spec, onDone) {
    const { sched } = run;
    const f = 0.8 + Math.random() * 0.45; // per-agent pace
    const emitAgent = () => run.emit('agent', { turn: run.turn, mission, agent });
    const pool = (spec.pool || []).slice();
    const addSources = (n) => {
      for (let i = 0; i < n && pool.length; i++) {
        const src = pool.shift();
        if (!agent.sources.some((s) => s.url === src.url)) agent.sources.push({ ...src });
      }
    };
    let t = 0;
    const at = (ms, fn) => {
      t += ms * f;
      sched.after(t, fn);
    };
    agent.startedAt = Date.now();
    agent.attempts = 1;
    agent.status = 'starting';
    agent.activity = 'Starting';
    emitAgent();
    at(500, () => {
      agent.status = 'thinking';
      agent.activity = 'Planning searches';
      agent.thinking = spec.thinking || '';
      emitAgent();
    });
    (spec.queries || []).forEach((q, i) => {
      at(i === 0 ? 1900 : 1700, () => {
        agent.status = 'searching';
        agent.activity = `Searching “${q}”`;
        agent.searches.push(q);
        agent.usage.searches += 1;
        addSources(2);
        emitAgent();
      });
    });
    if (spec.fetch) {
      at(1700, () => {
        agent.status = 'reading';
        let host = 'the web';
        try {
          host = new URL(spec.fetch.url).hostname.replace(/^www\./, '');
        } catch {
          /* keep default */
        }
        agent.activity = `Reading ${host}`;
        agent.fetches.push(spec.fetch.url);
        agent.usage.fetches += 1;
        addSources(2);
        emitAgent();
      });
    }
    at(1900, () => {
      agent.status = 'writing';
      agent.activity = 'Writing report';
      addSources(4);
      emitAgent();
      const parts = chunk(spec.report || '');
      const step = (2600 * f) / Math.max(1, parts.length);
      parts.forEach((p, i) => {
        sched.after(step * (i + 1), () => {
          agent.report += p;
          emitAgent();
          if (i === parts.length - 1) {
            sched.after(250, () => {
              agent.status = 'done';
              agent.activity = 'Report delivered';
              agent.endedAt = Date.now();
              agent.usage.input += 17000 + Math.round(Math.random() * 6000);
              agent.usage.output += 2100 + Math.round(Math.random() * 900);
              agent.usage.cacheRead += 3200;
              agent.costUsd = Math.round(((agent.usage.input * 2 + agent.usage.output * 10 + agent.usage.cacheRead * 0.1) / 1e6 + agent.usage.searches * 0.01) * 1e6) / 1e6;
              emitAgent();
              run.addCost(agent.costUsd, { searches: agent.usage.searches, fetches: agent.usage.fetches });
              onDone();
            });
          }
        });
      });
    });
  }

  function playShowcase(run) {
    const { sched, turn } = run;
    const parallel = 4;
    const think = run.addSegment({ kind: 'thinking', text: '', req: 0, startedAt: Date.now(), endedAt: null });
    run.stream(think, 'The owner wants a full trip plan with several moving parts: bloom timing, lodging, food, transit, a day trip, crowds and a budget ceiling. They also asked me to remember that they dislike crowds — I’ll save that first. This is broad, multi-angle research, so a swarm of specialists fits.', 1900, () => {
      think.endedAt = Date.now();
      run.touch(think);
    });
    sched.after(2300, () => {
      run.addSegment({ kind: 'memory', action: 'add', fact: 'Prefers to avoid crowds when traveling', req: 0 });
      run.addCost(0.018, { input: 3100, output: 420 });
    });
    sched.after(2900, () => {
      const intro = run.addSegment({ kind: 'text', text: '', req: 1, citations: [] });
      run.stream(intro, SHOWCASE_INTRO, 1500, () => {
        sched.after(250, () => {
          const mission = newMission(run, 'Kyoto in bloom: a 5-day plan for two', SHOWCASE_AGENTS);
          sched.after(520 + SHOWCASE_AGENTS.length * 230 + 500, () => {
            run.addCost(0.064, { input: 9800, output: 1650 });
            runMission(run, mission, SHOWCASE_AGENTS, parallel, () => synthesize(run));
          });
        });
      });
    });
  }

  function synthesize(run) {
    const { sched } = run;
    sched.after(600, () => {
      const think = run.addSegment({ kind: 'thinking', text: '', req: 2, startedAt: Date.now(), endedAt: null });
      run.stream(think, SHOWCASE_SYNTH_THINKING, 2400, () => {
        think.endedAt = Date.now();
        run.touch(think);
        const answer = run.addSegment({ kind: 'text', text: '', req: 2, citations: [] });
        run.stream(answer, SHOWCASE_ANSWER, 11000, () => {
          answer.citations = SHOWCASE_CITATIONS.map((s) => ({ ...s }));
          run.touch(answer);
          run.addCost(0.142, { input: 24600, output: 3300 });
          sched.after(400, () => run.finish('done'));
        });
        sched.after(3000, () => {
          answer.citations = SHOWCASE_CITATIONS.slice(0, 3).map((s) => ({ ...s }));
          run.touch(answer);
        });
      });
    });
  }

  function playGenericAnswer(run, text) {
    const { sched } = run;
    const think = run.addSegment({ kind: 'thinking', text: '', req: 0, startedAt: Date.now(), endedAt: null });
    run.stream(think, 'This is demo mode, so there is no connection to Claude. I should say so plainly and point the owner to the real setup.', 1200, () => {
      think.endedAt = Date.now();
      run.touch(think);
      sched.after(200, () => {
        const short = text.length > 80 ? `${text.slice(0, 77)}…` : text;
        const seg = run.addSegment({ kind: 'text', text: '', req: 0, citations: [] });
        run.stream(
          seg,
          `I’m running in **demo mode**, so I can’t reach Claude and nothing you type leaves this device — including “${short}”.\n\n- **To use Jarvis for real:** open it without \`?demo=1\` and connect your Anthropic API key.\n- **To see the agent team:** switch the mode to **Swarm** and send any research question.`,
          2600,
          () => {
            run.addCost(0, {});
            sched.after(200, () => run.finish('done'));
          },
        );
      });
    });
  }

  function playGenericSwarm(run, text, count) {
    const { sched } = run;
    const roles = [
      ['Background researcher', 'Establish the essential background and key terms.'],
      ['Recent developments', 'Find what changed most recently and why it matters.'],
      ['Data & numbers', 'Collect the most important figures and their sources.'],
      ['Expert views', 'Summarize what credible experts say, including disagreements.'],
      ['Fact-checker', 'Verify the claims most likely to be wrong or outdated.'],
      ['Practical advisor', 'Turn the findings into concrete next steps.'],
    ];
    const names = ['Nova', 'Echo', 'Vega', 'Orion', 'Lyra', 'Juno'];
    const topic = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    const specs = roles.slice(0, count).map(([role, task], i) => ({
      codename: names[i],
      role,
      task: `${task} Topic: ${text}`,
      queries: [topic],
      fetch: null,
      pool: [],
      thinking: 'Simulated agent: in demo mode no searches are made.',
      report: `*Simulated report — demo mode.*\n\nIn the real app I would search the web for “${topic}”, read the most relevant pages, and report back with cited findings for the ${role.toLowerCase()} angle.`,
    }));
    const intro = run.addSegment({ kind: 'text', text: '', req: 0, citations: [] });
    run.stream(intro, `Deploying a ${count}-agent demo team on “${topic}”. In demo mode the agents are simulated, so no searches are made.`, 1200, () => {
      sched.after(200, () => {
        const mission = newMission(run, `Demo: ${topic}`.slice(0, 60), specs);
        sched.after(520 + specs.length * 230 + 400, () =>
          runMission(run, mission, specs, 3, () => {
            sched.after(500, () => {
              const seg = run.addSegment({ kind: 'text', text: '', req: 1, citations: [] });
              run.stream(seg, 'That was a **simulated mission**: in demo mode Jarvis never contacts the Claude API. Connect your Anthropic API key to run real research with live web search and cited sources.', 2200, () => {
                sched.after(300, () => run.finish('done'));
              });
            });
          }),
        );
      });
    });
  }

  const engine = {
    newConversation,
    startTurn,
    canResume: () => false,
    resumeTurn: () => null,
    async testApiKey() {
      await new Promise((r) => setTimeout(r, 600));
      return { ok: false, error: { kind: 'unknown', message: 'Keys aren’t tested in demo mode. Open Jarvis without ?demo=1 to connect.', retryable: false } };
    },
    isBusy: () => active.size > 0,
  };

  /** Canned follow-up chips (SPEC §14.5) for a finished demo turn; never calls the API. */
  async function suggestFollowups(turn, { signal } = {}) {
    await new Promise((r) => setTimeout(r, Math.round(700 / speed)));
    if (signal && signal.aborted) return [];
    const missions = Object.keys((turn && turn.missions) || {}).length;
    return missions
      ? ['Which ryokan would you book for us?', 'What should we reserve before we fly?', 'Swap the day trip for somewhere quieter']
      : ['Can you go deeper on that?', 'What are the main trade-offs?', 'Summarize it in three bullets'];
  }

  return {
    engine,
    store: demoStore,
    showcaseId: 'demo-kyoto',
    showcasePrompt: SHOWCASE_PROMPT,
    speed,
    suggestFollowups,
  };
}
