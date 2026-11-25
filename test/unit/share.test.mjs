// Records pack: Markdown builders and share/download helpers (src/ui/share.js).
// Run: node --test test/unit/share.test.mjs
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerMarkdown,
  missionReportMarkdown,
  conversationMarkdown,
  turnStatsLine,
  turnMetrics,
  demoteHeadings,
  sourceKey,
  reportFilename,
  escapeInline,
  shareText,
  copyText,
  canShareNatively,
  downloadText,
} from '../../src/ui/share.js';

const FMT = { locale: 'en-GB', timeZone: 'UTC' };
const T0 = Date.UTC(2026, 10, 19, 16, 35, 0); // Thu 19 Nov 2026, 16:35 UTC

// ---------------------------------------------------------------------------------------------
// Fixtures: a realistic two-wave swarm turn, a quick turn and a sparse turn.

function agent(codename, role, extra = {}) {
  return {
    id: `a-${codename}`,
    codename,
    role,
    task: `Task for ${codename}: research one angle and cite sources.`,
    web: true,
    model: 'claude-sonnet-5-5',
    status: 'done',
    activity: '',
    thinking: 'private planning that must not leak into exports',
    report: `## Key findings\n- ${codename} found something [src](https://example.com/${codename.toLowerCase()})\n\n## Confidence and gaps\nMedium.`,
    sources: [{ url: `https://example.com/${codename.toLowerCase()}`, title: `${codename} primary source` }],
    searches: [`${codename.toLowerCase()} query one`, `${codename.toLowerCase()} query two`],
    fetches: [`https://example.com/${codename.toLowerCase()}`],
    usage: { input: 1000, output: 400, cacheWrite: 0, cacheRead: 0, searches: 2, fetches: 1 },
    costUsd: 0.1,
    attempts: 1,
    startedAt: T0 + 10_000,
    endedAt: T0 + 70_000,
    error: null,
    ...extra,
  };
}

function swarmTurn() {
  const atlas = agent('Atlas', 'Battery chemistry analyst', {
    sources: [
      { url: 'https://www.catl.com/en/news/sodium/', title: 'CATL sodium-ion [gen 2]' },
      { url: 'https://example.com/atlas', title: 'Atlas primary source' },
      { url: 'https://en.wikipedia.org/wiki/Battery_(electricity)', title: 'Battery (electricity)' },
      { url: 'javascript:alert(1)', title: 'evil' },
      { url: 'https://news.example.org/a?utm_source=x&id=7', title: 'News with tracking' },
    ],
  });
  const nova = agent('Nova', 'Market analyst', {
    sources: [
      { url: 'https://catl.com/en/news/sodium', title: 'Duplicate of the CATL page' },
      { url: 'https://news.example.org/a?id=7#top', title: 'News again' },
      ...Array.from({ length: 14 }, (_, i) => ({ url: `https://many.example.net/p/${i}`, title: `Page ${i}` })),
    ],
  });
  const echo = agent('Echo', 'Supply chain analyst', {
    status: 'error',
    report: '',
    sources: [],
    costUsd: 0.02,
    attempts: 3,
    error: { kind: 'rate_limit', message: 'Rate limit reached after 3 attempts.', retryable: true },
  });
  const vega = agent('Vega', 'patent researcher', { status: 'stopped', report: '# Partial\nHalf a thought' });
  const queued = agent('Iris', 'Never started', { status: 'queued', startedAt: null, endedAt: null, attempts: 0, report: '', sources: [], searches: [], fetches: [], usage: undefined, costUsd: 0 });
  const orion = agent('Orion', 'Fact checker', { startedAt: T0 + 120_000, endedAt: T0 + 150_000 });
  const m1 = { id: 'm1', wave: 1, title: 'EV batteries 2026', createdAt: T0 + 5000, startedAt: T0 + 8000, endedAt: T0 + 100_000, status: 'partial', agents: [atlas, nova, echo, vega, queued] };
  const m2 = { id: 'm2', wave: 2, title: 'Verify claims', createdAt: T0 + 110_000, startedAt: T0 + 115_000, endedAt: T0 + 160_000, status: 'done', agents: [orion] };
  return {
    id: 'turn-swarm',
    role: 'jarvis',
    createdAt: T0,
    endedAt: T0 + 180_000,
    status: 'done',
    mode: 'swarm',
    leadModel: 'claude-opus-5-5',
    workerModel: 'claude-sonnet-5-5',
    depth: 'deep',
    segments: [
      { id: 's1', kind: 'thinking', text: 'secret lead thinking', req: 0 },
      { id: 's2', kind: 'text', text: "I'll deploy five agents, sir.", req: 0, citations: [] },
      { id: 's3', kind: 'mission', missionId: 'm1', req: 0 },
      { id: 's4', kind: 'text', text: 'One more check.', req: 1, citations: [] },
      { id: 's5', kind: 'mission', missionId: 'm2', req: 1 },
      { id: 's6', kind: 'tool', tool: 'web_search', query: 'sodium ion cars', status: 'done', results: [{ url: 'https://insideevs.example/sodium', title: 'Sodium cars' }], req: 2 },
      { id: 's7', kind: 'text', text: 'Sodium-ion batteries reached mass ', req: 2, citations: [] },
      { id: 's8', kind: 'text', text: 'production this year', req: 2, citations: [{ url: 'https://insideevs.example/sodium', title: 'Sodium cars' }] },
      { id: 's9', kind: 'text', text: '.\n\n## Details\n- Prices fell [BNEF](https://bnef.example/prices).\n\n### Sources\n- [CATL](https://www.catl.com/en/news/sodium/)', req: 2, citations: [] },
    ],
    missions: { m2, m1 }, // insertion order differs from display order on purpose
    usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, searches: 12, fetches: 6 },
    costUsd: 0.84,
    stats: { agents: 5, searches: 12, sources: 99, waves: 2, durationMs: 180_000 },
    error: null,
  };
}

function quickTurn() {
  return {
    id: 'turn-quick',
    role: 'jarvis',
    createdAt: T0 + 600_000,
    endedAt: T0 + 615_000,
    status: 'done',
    mode: 'quick',
    leadModel: 'claude-opus-5-5',
    workerModel: 'claude-sonnet-5-5',
    depth: 'fast',
    segments: [
      { id: 'q1', kind: 'memory', action: 'add', fact: 'Owner drives a Model 3', req: 0 },
      { id: 'q2', kind: 'text', text: 'Noted, sir.', req: 0, citations: [] },
      { id: 'q3', kind: 'tool', tool: 'web_fetch', url: 'https://www.tesla.example/model3', status: 'done', results: [{ url: 'https://www.tesla.example/model3', title: 'Model 3' }], req: 0 },
      { id: 'q4', kind: 'text', text: '# Range\nAbout 500 km.', req: 0, citations: [{ url: 'https://www.tesla.example/model3', title: 'Model 3' }] },
    ],
    missions: {},
    usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 1 },
    costUsd: 0.02,
    stats: { agents: 0, searches: 0, sources: 1, waves: 0, durationMs: 15_000 },
    error: null,
  };
}

function conversation() {
  return {
    id: 'c1',
    v: 1,
    title: 'EV batteries',
    createdAt: T0 - 1000,
    updatedAt: T0 + 700_000,
    turns: [
      { id: 'u1', role: 'user', text: 'What are the big EV battery breakthroughs of 2026?', mode: 'swarm', createdAt: T0 - 1000 },
      swarmTurn(),
      { id: 'u2', role: 'user', text: '# not a heading\n---\nRemember my car.', mode: 'quick', createdAt: T0 + 599_000 },
      quickTurn(),
      { id: 'u3', role: 'user', text: 'Cheapest EV?', mode: 'auto', createdAt: T0 + 650_000 },
      {
        id: 'turn-stopped',
        role: 'jarvis',
        createdAt: T0 + 651_000,
        endedAt: T0 + 655_000,
        status: 'stopped',
        mode: 'auto',
        segments: [{ id: 'x', kind: 'tool', tool: 'web_search', query: 'cheapest ev', status: 'done', results: [], req: 0 }],
        missions: {},
        costUsd: 0.01,
        stats: { agents: 0, searches: 1, sources: 0, waves: 0, durationMs: 4000 },
      },
      { id: 'u4', role: 'user', text: 'Hello?', mode: 'auto', createdAt: T0 + 700_000 },
      { id: 'turn-error', role: 'jarvis', createdAt: T0 + 701_000, endedAt: T0 + 702_000, status: 'error', segments: [], missions: {}, error: { kind: 'auth', message: 'Your API key was rejected.', retryable: false } },
    ],
  };
}

const NO_GARBAGE = /undefined|NaN|\[object Object\]|\bnull\b/;

// ---------------------------------------------------------------------------------------------

describe('answerMarkdown', () => {
  test('uses the synthesis after the last mission and rejoins citation-split blocks', () => {
    const md = answerMarkdown(swarmTurn());
    assert.ok(md.startsWith('Sodium-ion batteries reached mass production this year.\n\n## Details'), md);
    assert.ok(!md.includes("I'll deploy"), 'preamble before the mission is left out');
    assert.ok(!md.includes('One more check'), 'wave-2 preamble is left out');
  });

  test('falls back to all text when nothing was written after the last mission', () => {
    const turn = swarmTurn();
    turn.segments = turn.segments.slice(0, 5); // stopped while wave 2 ran
    assert.equal(answerMarkdown(turn), "I'll deploy five agents, sir.\n\nOne more check.");
  });

  test('quick turn: all text, paragraphs separated around tool segments', () => {
    assert.equal(answerMarkdown(quickTurn()), 'Noted, sir.\n\n# Range\nAbout 500 km.');
  });

  test('returns an empty string for missing or malformed turns', () => {
    for (const bad of [null, undefined, 42, 'x', {}, { segments: 'nope' }, { segments: [null, 7, { kind: 'text' }] }]) assert.equal(answerMarkdown(bad), '');
  });

  test('{ sources: true } appends citations the text does not already link', () => {
    const md = answerMarkdown(quickTurn(), { sources: true });
    assert.ok(md.endsWith('**Sources**\n\n- [Model 3](https://www.tesla.example/model3)'), md);
    const swarm = answerMarkdown(swarmTurn(), { sources: true });
    assert.ok(swarm.endsWith('**More sources**\n\n- [Sodium cars](https://insideevs.example/sodium)'), 'labelled "More sources" when the answer already has a Sources list');
    const linked = quickTurn();
    linked.segments[3].text += ' See [the page](https://tesla.example/model3/).';
    assert.ok(!answerMarkdown(linked, { sources: true }).includes('**Sources**'), 'already linked (www/trailing slash variants) → nothing appended');
  });
});

describe('missionReportMarkdown (whole turn)', () => {
  const conv = conversation();
  const md = missionReportMarkdown(conv.turns[1], null, { ...FMT, conversation: conv, now: T0 + 900_000 });

  test('header: title, request, date, status, mode, models, totals', () => {
    const lines = md.split('\n');
    assert.equal(lines[0], '# Mission dossier: EV batteries 2026');
    assert.ok(md.includes('> What are the big EV battery breakthroughs of 2026?'));
    assert.ok(md.includes('- **Requested:** Thu 19 Nov 2026, 16:35 UTC') || md.includes('- **Requested:** Thu, 19 Nov 2026, 16:35 UTC'), md.slice(0, 400));
    assert.ok(md.includes('- **Status:** Complete · 3 of 6 agents reported back'));
    assert.ok(md.includes('- **Mode:** Swarm · Deep depth'));
    assert.ok(md.includes('- **Models:** Claude Opus 5.5 (lead) · Claude Sonnet 5.5 (agents)'));
    assert.ok(md.includes('- **Agents:** 5 deployed across 2 waves — 3 done, 1 failed, 1 stopped, 1 not started'));
    assert.ok(md.includes('- **Duration:** 3m 00s'));
    assert.ok(md.includes('- **Estimated cost:** ≈ $0.84 (lead and agents)'));
  });

  test('header source count matches the deduplicated master list', () => {
    const count = Number(/· (\d+) unique sources/.exec(md)[1]);
    const listed = Number(/^## Sources \((\d+)\)$/m.exec(md)[1]);
    assert.equal(count, listed);
    // atlas: catl, example/atlas, wikipedia, news(id=7) · nova: (catl dup), (news dup), 14 pages · echo none · vega example/vega
    // iris none · orion example/orion · lead: insideevs · linked only in prose: bnef (answer), example/nova (Nova's
    // report; its source list was replaced)  → 4 + 14 + 1 + 1 + 1 + 1 + 1 = 23
    assert.equal(listed, 23);
    assert.ok(md.includes('- **Research:** 12 searches · 6 pages read · 23 unique sources'));
    assert.ok(md.includes('[example.com](https://example.com/nova) — example.com · via Nova'), 'generic link text ("src") is not used as a title');
  });

  test('final answer is included with headings demoted below the document outline', () => {
    assert.ok(md.includes('## Final answer\n\nSodium-ion batteries reached mass production this year.\n\n### Details'));
    assert.ok(md.includes('#### Sources\n- [CATL](https://www.catl.com/en/news/sodium/)'));
  });

  test('one section per agent, in wave order, with task, report, sources', () => {
    const order = ['### Wave 1: EV batteries 2026', '#### Atlas · Battery chemistry analyst', '#### Nova · Market analyst', '#### Echo · Supply chain analyst', '#### Vega · Patent researcher', '#### Iris · Never started', '### Wave 2: Verify claims', '#### Orion · Fact checker'];
    let at = -1;
    for (const heading of order) {
      const i = md.indexOf(`\n${heading}\n`);
      assert.ok(i > at, `${heading} in order`);
      at = i;
    }
    assert.ok(md.includes('> Task for Atlas: research one angle and cite sources.'));
    assert.ok(md.includes('**Search log:** “atlas query one” · “atlas query two”'));
    assert.ok(md.includes('**Report**\n\n##### Key findings\n- Atlas found something'), 'agent report headings demoted under the agent heading');
    assert.ok(md.includes('**Report (partial)**\n\n##### Partial\nHalf a thought'), 'stopped agent keeps its partial report');
  });

  test('failed and never-started agents explain themselves', () => {
    assert.ok(md.includes('- **Status:** Failed · 1m 00s · ≈ $0.02 — Rate limit reached after 3 attempts.'));
    assert.ok(md.includes('- **Attempts:** 3'));
    assert.ok(md.includes('*No report: the agent failed before writing one.*'));
    assert.ok(md.includes('- **Status:** Not started'));
    assert.ok(md.includes('*No report: the agent never started.*'));
  });

  test('per-agent source lists are capped at 12 with a pointer to the master list', () => {
    const nova = md.slice(md.indexOf('#### Nova'), md.indexOf('#### Echo'));
    assert.ok(nova.includes('12. [Page 9](https://many.example.net/p/9) — many.example.net'));
    assert.ok(!nova.includes('13. '));
    assert.ok(nova.includes('*…and 4 more sources in the master list below.*'));
  });

  test('master list: deduplicated, cited first, attributed', () => {
    assert.ok(md.includes('### Cited in the answer (3)'));
    assert.ok(md.includes('[BNEF](https://bnef.example/prices) — bnef.example · via Jarvis'), 'pages linked only in the answer are listed');
    assert.ok(md.includes('2. [CATL sodium-ion \\[gen 2\\]](https://www.catl.com/en/news/sodium/) — catl.com · via Atlas, Nova'));
    assert.ok(md.includes('[Sodium cars](https://insideevs.example/sodium) — insideevs.example · via Jarvis'));
    assert.ok(md.includes('### Also consulted (20)'));
    assert.ok(md.includes('[News with tracking](https://news.example.org/a?utm_source=x&id=7) — news.example.org · via Atlas, Nova'));
    assert.equal(md.match(/catl\.com\/en\/news\/sodium/g).length, 4, 'CATL listed once in the master list (plus Atlas, Nova and the answer)');
  });

  test('never links unsafe URLs and encodes parentheses in link targets', () => {
    assert.ok(!/javascript:/i.test(md));
    assert.ok(md.includes('(https://en.wikipedia.org/wiki/Battery_%28electricity%29)'));
  });

  test('private thinking never leaks; no garbage values', () => {
    assert.ok(!md.includes('private planning'));
    assert.ok(!md.includes('secret lead thinking'));
    assert.ok(!NO_GARBAGE.test(md), md.match(NO_GARBAGE));
    assert.ok(md.includes('*Exported from Jarvis on Thu'), 'footer with export time');
    assert.ok(md.endsWith('\n') && !md.includes('\n\n\n'));
  });
});

describe('missionReportMarkdown (one wave, sparse data)', () => {
  test('single mission by object or id: wave n of N, only that wave, wave cost vs whole request', () => {
    const turn = swarmTurn();
    const byObj = missionReportMarkdown(turn, turn.missions.m2, FMT);
    const byId = missionReportMarkdown(turn, 'm2', FMT);
    assert.equal(byObj.replace(/Exported from Jarvis on [^.]+\./, ''), byId.replace(/Exported from Jarvis on [^.]+\./, ''));
    assert.ok(byObj.startsWith('# Mission dossier: Verify claims\n'));
    assert.ok(byObj.includes('- **Wave:** 2 of 2'));
    assert.ok(byObj.includes('- **Status:** Complete · 1 of 1 agent reported back'));
    assert.ok(byObj.includes('- **Estimated cost:** ≈ $0.10 for this wave\'s agents · ≈ $0.84 for the whole request'));
    assert.ok(byObj.includes('### Orion · Fact checker'));
    assert.ok(!byObj.includes('Atlas'));
    assert.ok(byObj.includes('- **Research:** 2 searches · 1 page read · 1 unique source'));
    assert.ok(byObj.includes('## Sources (1)') && !byObj.includes('bnef.example) —'), "the answer's own links are not this wave's sources");
  });

  test('a turn without agents becomes a Jarvis briefing', () => {
    const conv = conversation();
    const md = missionReportMarkdown(conv.turns[3], undefined, { ...FMT, conversation: conv });
    assert.ok(md.startsWith('# Jarvis briefing: # not a heading — Remember my car.') || md.startsWith('# Jarvis briefing: '), md.split('\n')[0]);
    assert.ok(md.includes('*Jarvis answered this one directly; no agents were deployed.*'));
    assert.ok(md.includes('- **Estimated cost:** ≈ $0.02\n'), 'no "(lead and agents)" without agents');
    assert.ok(md.includes('### Range\nAbout 500 km.'));
  });

  test('tolerates missing fields everywhere', () => {
    const sparse = {
      id: 't',
      status: 'interrupted',
      segments: [{ kind: 'mission', missionId: 'mx' }, { kind: 'text' }, null],
      missions: {
        mx: { id: 'mx', agents: [{ codename: 'Atlas' }, { role: 'Lonely role', status: 'done', sources: [{ url: 'ftp://x' }, { title: 'no url' }, null] }, null, 'junk'] },
        bad: null,
      },
      stats: { agents: 'many', searches: -3 },
      costUsd: 'free',
    };
    const md = missionReportMarkdown(sparse, null, FMT);
    assert.ok(!NO_GARBAGE.test(md), md);
    assert.ok(md.includes('### Atlas\n'), 'agent without role');
    assert.ok(md.includes('### Agent 2 · Lonely role'), 'agent without codename');
    assert.ok(md.includes('- **Status:** Interrupted before finishing'));
    assert.ok(md.includes('*No final answer was written for this request.*'));
    for (const bad of [null, undefined, {}, [], 'turn']) assert.doesNotThrow(() => missionReportMarkdown(bad, null, FMT));
  });
});

describe('conversationMarkdown', () => {
  const md = conversationMarkdown(conversation(), { ...FMT, now: T0 + 900_000 });

  test('title, meta and totals', () => {
    assert.ok(md.startsWith('# EV batteries\n\n*Jarvis conversation · started Thu'));
    assert.ok(md.includes('· 4 exchanges*'));
    assert.ok(md.includes('*Totals: 5 agents · 13 searches · ≈ $0.87 estimated*'));
  });

  test('every exchange in order with compact activity lines', () => {
    const order = ['## You · Thu 19 Nov, 16:34', '## Jarvis · 16:35 · Swarm', '> **Mission · wave 1: EV batteries 2026** — Partial · 5 agents', '> **Mission · wave 2: Verify claims** — Complete · 1 agent — 1 done', '*Searched the web: “sodium ion cars”*', '## You · 16:44', '## Jarvis · 16:45 · Quick', '*Remembered: “Owner drives a Model 3”*', '*Read: tesla.example*', '*Stopped by the owner.*', '> **Error:** Your API key was rejected.'];
    let at = -1;
    for (const needle of order) {
      const i = md.indexOf(needle);
      assert.ok(i > at, `${needle} in order (at ${i}, after ${at})`);
      at = i;
    }
    assert.ok(md.includes('> Atlas (Battery chemistry analyst) · Nova (Market analyst) · Echo (Supply chain analyst) · Vega (Patent researcher) · Iris (Never started)'));
  });

  test("owner's text cannot turn into headings or rules; thinking stays private", () => {
    assert.ok(md.includes('\\# not a heading\n\\---\nRemember my car.'));
    assert.ok(!md.includes('secret lead thinking'));
    assert.ok(!md.includes('private planning'));
    assert.ok(!NO_GARBAGE.test(md));
  });

  test('stats lines match the turn footer (without repeating "Stopped")', () => {
    assert.ok(md.includes('*5 agents · 12 searches · 99 sources · 3m 00s · ≈ $0.84*'));
    assert.ok(md.includes('*1 search · 4s · ≈ $0.01*'));
    assert.equal(turnStatsLine(conversation().turns[5]), 'Stopped · 1 search · 4s · ≈ $0.01');
  });

  test('empty and malformed conversations', () => {
    const empty = conversationMarkdown({ title: '' }, FMT);
    assert.ok(empty.startsWith('# Jarvis conversation\n'));
    assert.ok(empty.includes('*This conversation is empty.*'));
    assert.doesNotThrow(() => conversationMarkdown(null));
    assert.doesNotThrow(() => conversationMarkdown({ turns: [null, 1, { role: 'jarvis' }, { role: 'user' }] }));
  });
});

describe('helpers', () => {
  test('turnMetrics takes the larger of reported and counted values', () => {
    const m = turnMetrics(swarmTurn());
    assert.equal(m.agents, 5); // queued Iris never ran
    assert.equal(m.agentsOk, 3);
    assert.equal(m.agentsFailed, 1);
    assert.equal(m.missions, 2);
    assert.equal(m.searches, 12);
    assert.equal(m.sources, 99);
    assert.equal(m.costUsd, 0.84);
    assert.deepEqual(m.roles, ['Battery chemistry analyst', 'Market analyst', 'Supply chain analyst', 'patent researcher', 'Never started', 'Fact checker'], 'every agent of a launched mission, in order');
    const bare = swarmTurn();
    delete bare.stats;
    delete bare.usage;
    bare.costUsd = undefined;
    const counted = turnMetrics(bare);
    assert.equal(counted.agents, 5);
    assert.equal(counted.searches, 11); // 1 lead + 2 × 5 agents
    assert.equal(counted.sources, 21);
    assert.equal(Math.round(counted.costUsd * 100), 42); // sum of agent costs
  });

  test('demoteHeadings shifts ATX headings, skips code fences, never promotes', () => {
    const md = '# A\n## B\n```\n# not heading\n```\n~~~js\n## nor this\n~~~\n###### F';
    assert.equal(demoteHeadings(md, 3), '### A\n#### B\n```\n# not heading\n```\n~~~js\n## nor this\n~~~\n**F**');
    assert.equal(demoteHeadings('### Deep\ntext', 2), '### Deep\ntext');
    assert.equal(demoteHeadings('no headings', 4), 'no headings');
    assert.equal(demoteHeadings('## Closed ##', 3), '### Closed');
  });

  test('sourceKey normalizes www, trailing slash, hash and utm_ params; rejects non-http', () => {
    assert.equal(sourceKey('https://www.Example.com/a/?utm_source=x&b=1#frag'), sourceKey('http://example.com/a?b=1'));
    assert.notEqual(sourceKey('https://example.com/a?b=1'), sourceKey('https://example.com/a?b=2'));
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x/y', '', null, 7]) assert.equal(sourceKey(bad), null);
  });

  test('escapeInline neutralizes Markdown syntax and collapses whitespace', () => {
    assert.equal(escapeInline(' [a](b) *x* `c` <d>\n|e| '), '\\[a\\](b) \\*x\\* \\`c\\` \\<d\\> \\|e\\|');
  });

  test('reportFilename builds a safe, dated slug', () => {
    const d = new Date(2026, 10, 19);
    assert.equal(reportFilename('mission', 'EV batteries: 2026 (deep dive)!', d), 'jarvis-mission-ev-batteries-2026-deep-dive-2026-11-19.md');
    assert.equal(reportFilename('conversation', 'Ça coûte combien — “prix”?', d), 'jarvis-conversation-ca-coute-combien-prix-2026-11-19.md');
    assert.equal(reportFilename('answer', '???', d), 'jarvis-answer-untitled-2026-11-19.md');
    assert.ok(reportFilename('mission', 'x'.repeat(200), d).length < 80);
  });
});

// ---------------------------------------------------------------------------------------------
// Delivery helpers with fake browser globals

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

describe('shareText / copyText', () => {
  afterEach(() => {
    if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
    delete globalThis.document;
  });

  const clipboard = (log, fail = false) => ({
    writeText: async (t) => {
      log.push(['clip', t]);
      if (fail) throw new DOMException('denied', 'NotAllowedError');
    },
  });

  test('uses the Web Share API when available', async () => {
    const log = [];
    setNavigator({ share: async (d) => log.push(['share', d]), canShare: () => true, clipboard: clipboard(log) });
    assert.equal(canShareNatively(), true);
    assert.equal(await shareText({ title: '  Mission  dossier ', text: '# Body' }), 'shared');
    assert.deepEqual(log, [['share', { title: 'Mission dossier', text: '# Body' }]]);
  });

  test('a dismissed share sheet (AbortError) is "failed", silently, without copying', async () => {
    const log = [];
    setNavigator({
      share: async () => {
        throw new DOMException('Share canceled', 'AbortError');
      },
      clipboard: clipboard(log),
    });
    assert.equal(await shareText({ title: 't', text: 'x' }), 'failed');
    assert.deepEqual(log, []);
  });

  test('other share errors fall back to the clipboard', async () => {
    const log = [];
    setNavigator({
      share: async () => {
        throw new DOMException('no gesture', 'NotAllowedError');
      },
      clipboard: clipboard(log),
    });
    assert.equal(await shareText({ title: 't', text: 'fallback' }), 'copied');
    assert.deepEqual(log, [['clip', 'fallback']]);
  });

  test('canShare() === false skips the share sheet', async () => {
    const log = [];
    setNavigator({ share: async () => log.push(['share']), canShare: () => false, clipboard: clipboard(log) });
    assert.equal(await shareText({ text: 'big' }), 'copied');
    assert.deepEqual(log, [['clip', 'big']]);
  });

  test('no Web Share: clipboard; no clipboard either: legacy execCommand; nothing works: failed', async () => {
    const log = [];
    setNavigator({ clipboard: clipboard(log) });
    assert.equal(canShareNatively(), false);
    assert.equal(await shareText({ title: 'a', text: 'b' }), 'copied');

    setNavigator({ clipboard: clipboard(log, true) });
    const removed = [];
    globalThis.document = {
      activeElement: null,
      body: { appendChild: (el) => log.push(['append', el.value]) },
      createElement: () => ({ style: {}, setAttribute() {}, select() {}, setSelectionRange() {}, remove() { removed.push(1); } }),
      execCommand: (cmd) => cmd === 'copy',
    };
    assert.equal(await copyText('legacy'), true);
    assert.deepEqual(log.at(-1), ['append', 'legacy']);
    assert.equal(removed.length, 1, 'temporary textarea removed');

    delete globalThis.document;
    assert.equal(await shareText({ text: 'nowhere' }), 'failed');
    setNavigator(undefined);
    assert.equal(await shareText({ text: 'nowhere' }), 'failed');
  });
});

describe('downloadText', () => {
  let created;
  let revoked;
  let anchors;
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    created = [];
    revoked = [];
    anchors = [];
    URL.createObjectURL = (blob) => {
      created.push(blob);
      return `blob:test/${created.length}`;
    };
    URL.revokeObjectURL = (u) => revoked.push(u);
    globalThis.document = {
      body: { appendChild: (a) => anchors.push(a) },
      createElement: (tag) => {
        const a = { tag, style: {}, clicked: 0, removed: 0 };
        a.click = () => a.clicked++;
        a.remove = () => a.removed++;
        return a;
      },
    };
  });
  afterEach(() => {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    delete globalThis.document;
    mock.timers.reset();
  });

  test('saves through a temporary anchor and revokes the object URL afterwards', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    assert.equal(downloadText('jarvis-mission-x.md', '# Report\n'), true);
    assert.equal(anchors.length, 1);
    const a = anchors[0];
    assert.equal(a.tag, 'a');
    assert.equal(a.href, 'blob:test/1');
    assert.equal(a.download, 'jarvis-mission-x.md');
    assert.equal(a.clicked, 1);
    assert.equal(a.removed, 1);
    assert.equal(created[0].type, 'text/markdown;charset=utf-8');
    assert.equal(await created[0].text(), '# Report\n');
    assert.deepEqual(revoked, [], 'not revoked synchronously (Safari would cancel the download)');
    mock.timers.tick(5000);
    assert.deepEqual(revoked, ['blob:test/1']);
  });

  test('sanitizes file names and honours a custom MIME type', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    downloadText('../evil/na:me?.txt', 'x', 'text/plain');
    assert.equal(anchors[0].download, '-evil-na-me-.txt');
    assert.equal(created[0].type, 'text/plain;charset=utf-8');
    mock.timers.tick(5000);
  });

  test('returns false without a document', () => {
    delete globalThis.document;
    assert.equal(downloadText('a.md', 'x'), false);
  });
});

describe('turnStatsLine: home base exchanges (v7.8.1)', () => {
  test('free when the Core answered at no cost; "Home base" for a full briefing it made just now with the key', () => {
    assert.equal(turnStatsLine({ role: 'jarvis', local: 'homebase' }), 'Free · Home base');
    assert.equal(turnStatsLine({ role: 'jarvis', local: 'homebase', homeBasePaid: true }), 'Home base');
    assert.equal(turnStatsLine({ role: 'jarvis', local: 'homebase', homeBasePaid: 'yes' }), 'Free · Home base', 'only true counts');
    assert.equal(turnStatsLine({ role: 'jarvis', local: 'music', homeBasePaid: true }), 'Free · Apple Music');
  });
});
