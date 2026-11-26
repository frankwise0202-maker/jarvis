// v8.1.1 fixes MONEY-R2-1, MONEY-R2-2 and MONEY-R2-3 (the second review of the live view's $1 an hour for
// answers). Ported from the reviewers' probes (review2/money-*/test/unit/money-r2 and money-v): the real
// engine and SDK against a scripted API that bills server-tool rounds as the API does (each later round
// reads the rest again from the cache and writes what is new).
//   MONEY-R2-1  the meter stops a gated answer only when the hour itself can't hold its next round: with
//               room in the hour it grows what it holds. Then, and only then, the cap line; a page fetch
//               beyond the budget is stopped with its own line. A stopped request counts at most what it
//               may have cost (the meter's figure), and the question stays in the history once sent.
//   MONEY-R2-2  Resume keeps the decision made when the turn was asked (turn.liveGated).
//   MONEY-R2-3  a gated request that fails after it started (a mid-stream error, the owner's Stop) counts at
//               most what it may have cost, not its whole reservation, so retries can't fill the hour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costOf } from '../../src/engine/models.js';
import { createLiveBudget } from '../../src/lib/live-view.js';
import * as G from '../../src/lib/live-gate.js';
import { blk, createHarness, deployInput, workerReply } from './engine.support.test.mjs';

const LEAD = 'claude-opus-5-5';
const CAP = /^That would take the live view past its dollar this hour\./;

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

function liveHour(spent = 0) {
  const storage = memoryStorage();
  const budget = createLiveBudget({ storage });
  if (spent > 0) budget.add(spent);
  return { budget, gate: G.createLiveGate({ budget, storage }) };
}

/** A search result of about `tokens` tokens (3 characters a token), over `n` results. */
const searchResult = (id, tokens, n = 1) => ({
  type: 'web_search_tool_result',
  tool_use_id: id,
  content: Array.from({ length: n }, (_, k) => ({ type: 'web_search_result', url: `https://x.example/${id}/${k}`, title: 'X', page_age: null, encrypted_content: 'e'.repeat(Math.round((tokens * 3) / n)) })),
});

/** Usage billed as the API bills server rounds: the prompt (cold: written; warm: read), then each round reads the rest and writes what is new. */
function billed({ prompt, warm = false, results = [], out = 300, searches = results.length }) {
  const startUsage = warm ? { input_tokens: 8, cache_creation_input_tokens: 300, cache_read_input_tokens: prompt - 300 } : { input_tokens: 8, cache_creation_input_tokens: prompt, cache_read_input_tokens: 0 };
  let creation = startUsage.cache_creation_input_tokens;
  let read = startUsage.cache_read_input_tokens;
  let prefix = prompt + 8;
  for (const r of results) {
    read += prefix;
    creation += out + r;
    prefix += out + r;
  }
  return { startUsage, usage: { input_tokens: 8, cache_creation_input_tokens: creation, cache_read_input_tokens: read, output_tokens: out * (results.length + 1), ...(searches ? { server_tool_use: { web_search_requests: searches } } : {}) } };
}

/** A conversation in `h`, warm (one earlier answer: its prompt cached) or new. */
async function chat(h, warm) {
  const conv = h.jarvis.newConversation();
  if (warm) {
    h.next = { content: [blk.text('Earlier answer.')], stop: 'end_turn', usage: { input_tokens: 8, cache_creation_input_tokens: 19000, cache_read_input_tokens: 0, output_tokens: 200 } };
    const t0 = await h.jarvis.startTurn(conv, { text: 'What is a USB-C PD charger?', mode: 'quick' }).done;
    assert.equal(t0.status, 'done');
  }
  return conv;
}

function scripted() {
  const h = createHarness({ handler: (req) => (req.kind === 'lead' ? h.next : { content: [blk.text('ok')], stop: 'end_turn' }) });
  return h;
}

const ask = (h, conv, gate) => h.jarvis.startTurn(conv, { text: 'What is this charger and what does it cost? Search the web.', mode: 'quick', gate: G.createTurnGate({ gate, isOn: () => true }) }).done;
const userAsked = (conv) => conv.apiMessages.some((m) => m.role === 'user' && JSON.stringify(m.content).includes('What is this charger and what does it cost?'));

for (const warm of [false, true]) {
  const chatKind = warm ? 'a warm chat' : 'a new chat';

  test(`MONEY-R2-1 (c): at an empty hour, in ${chatKind}, two searches of about 8,000 tokens each complete and count what they cost`, async () => {
    const { budget, gate } = liveHour(0);
    const h = scripted();
    const conv = await chat(h, warm);
    const reply = { content: [blk.search('s1', 'q1'), searchResult('s1', 8000, 8), blk.search('s2', 'q2'), searchResult('s2', 8000, 8), blk.text('It is the Anker 715, about $39.')], stop: 'end_turn', ...billed({ prompt: warm ? 19800 : 19000, warm, results: [8000, 8000] }) };
    h.next = reply;
    const turn = await ask(h, conv, gate);
    assert.equal(turn.status, 'done', `${turn.status} ${turn.error ? turn.error.message : ''}`);
    assert.ok(Math.abs(budget.spent() - costOf(LEAD, reply.usage)) < 1e-6, `the hour counts the real cost (${budget.spent()} vs ${costOf(LEAD, reply.usage)})`);
    assert.equal(gate.reserved(), 0);
  });

  test(`MONEY-R2-1 (b): at an empty hour, in ${chatKind}, a third search (one more than asked) completes`, async () => {
    const { budget, gate } = liveHour(0);
    const h = scripted();
    const conv = await chat(h, warm);
    const content = [];
    for (const i of [1, 2, 3]) content.push(blk.search(`s${i}`, `q${i}`), searchResult(`s${i}`, 5000, 4));
    content.push(blk.text('It is the Anker 715, about $39.'));
    const reply = { content, stop: 'end_turn', ...billed({ prompt: warm ? 19800 : 19000, warm, results: [5000, 5000, 5000] }) };
    h.next = reply;
    const turn = await ask(h, conv, gate);
    assert.equal(turn.status, 'done', `${turn.status} ${turn.error ? turn.error.message : ''}`);
    assert.ok(Math.abs(budget.spent() - costOf(LEAD, reply.usage)) < 1e-6);
    assert.equal(gate.reserved(), 0);
  });

  test(`MONEY-R2-1 (a): at an empty hour, in ${chatKind}, a page fetch beyond the budget is stopped with its own true line; the question stays; at most what it may have cost counts`, async () => {
    const { budget, gate } = liveHour(0);
    const h = scripted();
    const conv = await chat(h, warm);
    h.next = {
      content: [blk.search('s1', 'anker'), searchResult('s1', 3000, 2), blk.text('It looks like the Anker 65W. Let me check its spec page.'), blk.fetch('f1', 'https://x.example/s1/0'), blk.fetchResult('f1', 'https://x.example/s1/0', 'Spec'), blk.text('It is the Anker 715.')],
      stop: 'end_turn',
      ...billed({ prompt: warm ? 19800 : 19000, warm, results: [3000, 12000] }),
    };
    const turn = await ask(h, conv, gate);
    assert.equal(turn.status, 'error');
    assert.equal(turn.error.kind, 'live_cap', 'the gate\'s stop (Optics and Voice Mode say its line as they say the cap line)');
    assert.doesNotMatch(turn.error.message, CAP, 'not the cap line: the hour has room');
    assert.equal(turn.error.message, G.FETCH_LINE);
    assert.match(turn.error.message, /whole web page/);
    assert.ok(userAsked(conv), 'the question stays in the history once it was sent');
    // What the request may have cost by then, the meter's upper bound: its prompt as billed, all of
    // max_tokens (and written once), one search and its round (its result at the 4,000-token floor),
    // never the whole reservation.
    const prompt = warm ? 19800 : 19000;
    const start = billed({ prompt, warm }).startUsage;
    const promptUsd = costOf(LEAD, { ...start, output_tokens: 0 });
    const reread = ((start.cache_creation_input_tokens + start.cache_read_input_tokens) * 0.2 + start.input_tokens * 5) / 1e6;
    const bound = promptUsd + (4000 * 20 + 4000 * 5) / 1e6 + 0.01 + reread + (4000 * 0.2 + 4000 * 5) / 1e6;
    assert.ok(Math.abs(budget.spent() - bound) < 0.002, `the hour counts the meter's figure ($${budget.spent().toFixed(4)} vs $${bound.toFixed(4)})`);
    assert.ok(budget.spent() > promptUsd + 0.01, 'never less than what was surely billed (the prompt and the search)');
    assert.equal(gate.reserved(), 0);
  });
}

test('MONEY-R2-1: when the hour itself can\'t hold the next round, the request is stopped then, with the cap line, and the hour stays within $1', async () => {
  const { budget, gate } = liveHour(0.66);
  const h = scripted();
  const conv = await chat(h, false);
  const content = [];
  for (const i of [1, 2, 3, 4, 5, 6]) content.push(blk.search(`s${i}`, `q${i}`), searchResult(`s${i}`, 15000, 6));
  content.push(blk.text('Here is what I found.'));
  const reply = { content, stop: 'end_turn', ...billed({ prompt: 19000, results: [15000, 15000, 15000, 15000, 15000, 15000] }) };
  h.next = reply;
  const turn = await ask(h, conv, gate);
  assert.ok(0.66 + costOf(LEAD, reply.usage) > 1, 'run to the end it would pass the dollar');
  assert.equal(turn.status, 'error');
  assert.equal(turn.error.kind, 'live_cap');
  assert.match(turn.error.message, CAP);
  assert.ok(budget.spent() <= 1 + 1e-9, `the hour ends at ${budget.spent().toFixed(4)}`);
  assert.ok(userAsked(conv), 'sent, so the question stays');
  assert.equal(gate.reserved(), 0);
});

test('MONEY-R2-1: refused before it is sent (no room for even the input), the question leaves the history as before', async () => {
  const { budget, gate } = liveHour(0.95);
  const h = scripted();
  const conv = await chat(h, false);
  h.next = { content: [blk.text('x')], stop: 'end_turn' };
  const turn = await ask(h, conv, gate);
  assert.equal(turn.error && turn.error.kind, 'live_cap');
  assert.ok(!userAsked(conv), 'nothing was sent: the question leaves the history, so asked again it goes once');
  assert.ok(Math.abs(budget.spent() - 0.95) < 1e-9);
});

test('MONEY-R2-3: three mid-stream "overloaded" errors, then the answer, at an empty hour: each failed attempt counts at most what it may have cost', async () => {
  const { budget, gate } = liveHour(0);
  let n = 0;
  const h = createHarness({
    retryBaseMs: 1,
    handler: (req) => {
      if (req.kind !== 'lead') return { content: [blk.text('ok')], stop: 'end_turn' };
      n += 1;
      if (n <= 3) {
        return {
          sseError: { type: 'overloaded_error', message: 'Overloaded' },
          content: [blk.text('It looks like a charger')],
          startUsage: { input_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 15000 },
          usage: { input_tokens: 8, cache_read_input_tokens: 15000, output_tokens: 10 },
        };
      }
      return { content: [blk.text('It is a 65 W USB-C charger.')], stop: 'end_turn', usage: { input_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 15000, output_tokens: 120 } };
    },
  });
  const turn = await h.jarvis.startTurn(h.jarvis.newConversation(), { text: 'What is this?', mode: 'quick', gate: G.createTurnGate({ gate, isOn: () => true }) }).done;
  assert.equal(turn.status, 'done');
  assert.equal(n, 4);
  // Each failed attempt: its prompt as billed (a warm 15,000-token read) and all of its max_tokens (4,000):
  // about 8.3¢, against a whole reservation of about 26¢ each before.
  assert.ok(budget.spent() < 0.3, `the hour counts $${budget.spent().toFixed(4)}`);
  assert.equal(gate.reserved(), 0);
});

for (const warm of [true, false]) {
  test(`MONEY-R2-3: the owner's Stop while a gated answer streams, ${warm ? 'warm' : 'cold'} chat: the hour counts at most what it may have cost`, async () => {
    const { budget, gate } = liveHour(0);
    const startUsage = warm ? { input_tokens: 8, cache_creation_input_tokens: 300, cache_read_input_tokens: 19000 } : { input_tokens: 8, cache_creation_input_tokens: 19300, cache_read_input_tokens: 0 };
    const h = createHarness({
      handler: (req) =>
        req.kind === 'lead'
          ? { content: [blk.text('It is a sixty-five watt USB-C charger with two ports and a folding plug. '.repeat(30))], stop: 'end_turn', delayMs: 15, startUsage, usage: { ...startUsage, output_tokens: 600 } }
          : { content: [blk.text('ok')], stop: 'end_turn' },
    });
    const run = h.jarvis.startTurn(h.jarvis.newConversation(), { text: 'What is this charger?', mode: 'quick', gate: G.createTurnGate({ gate, isOn: () => true }), keepOnStop: true });
    setTimeout(() => run.abort(), 400);
    const turn = await run.done;
    assert.equal(turn.status, 'stopped');
    const prompt = costOf(LEAD, { ...startUsage, output_tokens: 0 });
    const bound = prompt + (4000 * 20) / 1e6; // the prompt as billed and all of max_tokens
    assert.ok(budget.spent() <= bound + 1e-9, `the hour counts $${budget.spent().toFixed(4)}, at most ${bound.toFixed(4)}`);
    assert.ok(budget.spent() >= prompt, 'and never less than what was surely billed');
    assert.equal(gate.reserved(), 0);
  });
}

/** A swarm cut by a dropped connection before its summary (the agents paid), asked with or without the live view's gate. */
async function interruptedMission({ spent, gated }) {
  const { budget, gate } = liveHour(spent);
  let leadN = 0;
  const h = createHarness({
    handler: (req) => {
      if (req.kind === 'worker') return workerReply('A');
      if (req.kind !== 'lead') return { content: [blk.text('ok')], stop: 'end_turn' };
      leadN += 1;
      if (leadN === 1) return { content: [blk.text('Sending a team.'), blk.deploy('toolu_d', deployInput(3, 'Chargers'))], stop: 'tool_use' };
      if (leadN === 2) return { content: [blk.text('Here is the summary of the team findings, in full detail. '.repeat(4))], stop: 'end_turn', breakAfter: 6 };
      return { content: [blk.text('Here is the summary of the team findings.')], stop: 'end_turn', usage: { input_tokens: 20000, output_tokens: 900 } };
    },
  });
  const conv = h.jarvis.newConversation();
  const live = { on: false };
  // Asked with the live view off (a swarm), or outside its dollar (the research offer's Mission: no gate).
  const first = await h.jarvis.startTurn(conv, { text: 'Compare 65 W USB-C chargers', mode: 'swarm', gate: gated ? G.createTurnGate({ gate, isOn: () => live.on }) : null }).done;
  assert.equal(first.status, 'interrupted');
  return { h, conv, budget, gate, live, first };
}

for (const [spent, gated] of [[0, true], [0.85, true], [0.85, false]]) {
  test(`MONEY-R2-2: a mission asked ${gated ? 'with the live view off' : 'outside the live view (the research offer\'s Mission)'}, cut before its summary, resumed while it is on (hour at ${spent * 100}¢): not gated`, async () => {
    const { h, conv, budget, gate, live, first } = await interruptedMission({ spent, gated });
    assert.equal(first.liveGated, false, 'the turn records the decision made when it was asked');
    live.on = true;
    const resumedGate = G.resumeTurnGate({ gate, isOn: () => live.on, turn: first }); // as app.js resume() makes it
    const resumed = await h.jarvis.resumeTurn(conv, { gate: resumedGate }).done;
    const leadMax = h.api.requests.filter((r) => r.kind === 'lead').map((r) => r.body.max_tokens);
    assert.equal(resumed.status, 'done', `${resumed.status} ${resumed.error ? resumed.error.message : ''}`);
    assert.ok(leadMax.at(-1) > 1000, `the resumed summary keeps its normal max_tokens (${leadMax})`);
    assert.ok(Math.abs(budget.spent() - spent) < 1e-9, 'nothing counted in the live view\'s hour');
    assert.equal(gate.reserved(), 0);
  });
}

test('MONEY-R2-2: a question asked during the live view, cut off, resumed after the live view stopped: still counted (v8.0: counted in full)', async () => {
  const { budget, gate } = liveHour(0);
  let leadN = 0;
  const h = createHarness({
    handler: (req) => {
      if (req.kind !== 'lead') return { content: [blk.text('ok')], stop: 'end_turn' };
      leadN += 1;
      if (leadN === 1) return { content: [blk.text('It is a charger with '.repeat(20))], stop: 'end_turn', breakAfter: 5, startUsage: { input_tokens: 8, cache_creation_input_tokens: 19000, cache_read_input_tokens: 0 } };
      return { content: [blk.text('It is a 65 W charger.')], stop: 'end_turn', usage: { input_tokens: 8, cache_creation_input_tokens: 19000, output_tokens: 300 } };
    },
  });
  const conv = h.jarvis.newConversation();
  const live = { on: true };
  const first = await h.jarvis.startTurn(conv, { text: 'What is this?', mode: 'quick', gate: G.createTurnGate({ gate, isOn: () => live.on }) }).done;
  assert.equal(first.status, 'interrupted');
  assert.equal(first.liveGated, true);
  const afterFirst = budget.spent();
  live.on = false;
  const resumed = await h.jarvis.resumeTurn(conv, { gate: G.resumeTurnGate({ gate, isOn: () => live.on, turn: first }) }).done;
  assert.equal(resumed.status, 'done');
  const real = costOf(LEAD, { input_tokens: 8, cache_creation_input_tokens: 19000, output_tokens: 300 });
  assert.ok(Math.abs(budget.spent() - afterFirst - real) < 1e-6, `the resumed request counts at its real cost (${(budget.spent() - afterFirst).toFixed(4)} vs ${real.toFixed(4)})`);
  assert.equal(gate.reserved(), 0);
});

test('MONEY-R2-2: a turn saved before v8.1.1 (no record) resumes as in v8.1: the live view\'s state at Resume decides', () => {
  const { gate } = liveHour(0);
  assert.equal(G.resumeTurnGate({ gate, isOn: () => true, turn: { role: 'jarvis' } }).active, true);
  assert.equal(G.resumeTurnGate({ gate, isOn: () => false, turn: { role: 'jarvis' } }).active, false);
  assert.equal(G.resumeTurnGate({ gate, isOn: () => true, turn: { role: 'jarvis', liveGated: false } }).active, false);
  const held = G.resumeTurnGate({ gate, isOn: () => false, turn: { role: 'jarvis', liveGated: true } });
  assert.equal(held.active, true);
  assert.equal(held.counting, true, 'asked during the live view: counted even with it stopped since');
});

// A simulated hour (from the reviewer's p5): windows on one budget, the live view's own looks every second in
// each, a question every `every` minutes from `order` (alternating windows; now and then both at once).
async function simulateHour({ windows = 2, every = 2, order, coldEvery = 3, bothEvery = 12 }) {
  const storage = memoryStorage();
  let T = Date.parse('2026-11-26T12:00:00Z');
  const now = () => T;
  const win = ['aaaaaa', 'bbbbbb'].slice(0, windows).map((instance) => {
    const budget = createLiveBudget({ storage, now });
    return { budget, gate: G.createLiveGate({ budget, storage, now, instance }), queue: [] };
  });
  for (const w of win) {
    w.h = createHarness({ retryBaseMs: 1, handler: (req) => (req.kind === 'lead' ? w.queue.shift() || { content: [blk.text('ok')], stop: 'end_turn' } : { content: [blk.text('ok')], stop: 'end_turn' }) });
    w.conv = w.h.jarvis.newConversation();
  }
  const prompt = 19000;
  const kinds = (warm) => ({
    plain: () => [{ content: [blk.text('It is a charger.')], stop: 'end_turn', ...billed({ prompt, warm }) }],
    twoSearches: () => [{ content: [blk.search('s1', 'a'), searchResult('s1', 3500), blk.search('s2', 'b'), searchResult('s2', 3500), blk.text('About $39.')], stop: 'end_turn', ...billed({ prompt, warm, results: [3500, 3500] }) }],
    threeSearches: () => {
      const c = [];
      for (const i of [1, 2, 3]) c.push(blk.search(`s${i}`, 'q'), searchResult(`s${i}`, 6000));
      c.push(blk.text('Here.'));
      return [{ content: c, stop: 'end_turn', ...billed({ prompt, warm, results: [6000, 6000, 6000] }) }];
    },
    fetch: () => [{ content: [blk.text('Let me read the page.'), blk.fetch('f1', 'https://x.example/p'), blk.fetchResult('f1', 'https://x.example/p', 'Page'), blk.text('Done.')], stop: 'end_turn', ...billed({ prompt, warm, results: [12000], searches: 0 }) }],
    toolRound: () => [
      { content: [blk.text('Noting that.'), blk.memory('toolu_m', 'add', 'Likes chargers')], stop: 'tool_use', ...billed({ prompt, warm }) },
      { content: [blk.text('Noted.')], stop: 'end_turn', ...billed({ prompt: prompt + 400, warm: true }) },
    ],
    midStream: () => [
      { sseError: { type: 'overloaded_error', message: 'Overloaded' }, content: [blk.text('It is')], ...billed({ prompt, warm }) },
      { content: [blk.text('It is a charger.')], stop: 'end_turn', ...billed({ prompt, warm: true }) },
    ],
    turnedDown: () => [{ error: { status: 529, type: 'overloaded_error', message: 'Overloaded' } }, { content: [blk.text('It is a charger.')], stop: 'end_turn', ...billed({ prompt, warm }) }],
  });
  const counted = () => win[0].budget.spent() + win[0].gate.reserved();
  const s = { worst: 0, looks: 0, refusedLooks: 0, lookUsd: 0, billedUsd: 0, realAtFirstRefusedLook: null, outcomes: [], cutAttempts: 0 };
  for (let minute = 0, q = 0; minute < 60; minute += every, q += 1) {
    for (let sec = 0; sec < every * 60; sec++) {
      T += 1000;
      for (const w of win) {
        if (w.gate.fits(0.00012)) {
          w.budget.add(0.0001);
          s.lookUsd += 0.0001;
          s.looks += 1;
        } else {
          if (s.realAtFirstRefusedLook === null) s.realAtFirstRefusedLook = s.lookUsd + s.billedUsd;
          s.refusedLooks += 1;
        }
      }
      s.worst = Math.max(s.worst, counted());
    }
    const k = order[q % order.length];
    const warm = q % coldEvery !== 0;
    const both = windows > 1 && bothEvery > 0 && minute % bothEvery === 10;
    const askers = both ? win : [win[q % windows]];
    const real = s.lookUsd + s.billedUsd;
    const done = await Promise.all(
      askers.map((w) => {
        w.queue.push(...kinds(warm)[k]());
        return w.h.jarvis.startTurn(w.conv, { text: `Question at minute ${minute}`, mode: 'quick', gate: G.createTurnGate({ gate: w.gate, isOn: () => true }) }).done.then((turn) => ({ w, turn }));
      }),
    );
    for (const { w, turn } of done) {
      s.billedUsd += Number(turn.costUsd) || 0;
      // Attempts cut after they were sent: a mid-stream error, a meter stop (each counts its max_tokens).
      if (k === 'midStream' && turn.status === 'done') s.cutAttempts += 1;
      // live_fetch here: the gate's stop before a page fetch (its own line), apart from the cap line.
      const kind = !turn.error ? null : turn.error.message === G.FETCH_LINE ? 'live_fetch' : turn.error.kind;
      if (kind === 'live_fetch' || (kind === 'live_cap' && turn.costUsd > 0)) s.cutAttempts += 1;
      s.outcomes.push({ minute, k, status: turn.status, kind, realBefore: real });
      w.queue.length = 0;
    }
    s.worst = Math.max(s.worst, counted());
    for (const w of win) assert.equal(w.gate.reserved(), 0, `minute ${minute}: nothing stays reserved once the turns end`);
  }
  s.answers = counted() - s.lookUsd;
  s.capped = s.outcomes.filter((o) => o.kind === 'live_cap');
  s.answered = s.outcomes.filter((o) => o.status === 'done');
  console.log(`# hour (${windows} window${windows > 1 ? 's' : ''}, a question every ${every} min): looks $${s.lookUsd.toFixed(4)} (${s.looks} looks, ${s.refusedLooks} refused) + answers $${s.answers.toFixed(4)} counted (billed $${s.billedUsd.toFixed(4)}); worst $${s.worst.toFixed(4)}; answered ${s.answered.length} of ${s.outcomes.length}; cap refusals at minutes ${s.capped.map((o) => o.minute).join(',') || 'none'}`);
  return s;
}

const MIX = ['plain', 'twoSearches', 'fetch', 'threeSearches', 'toolRound', 'midStream', 'turnedDown'];

test('MONEY-R2-1, MONEY-R2-3: the reviewer\'s hour (two windows, looks every second in each, a question every two minutes): never past $1, counted near what was billed, refusals only once real spending fills it', async () => {
  // Its looks alone cost about 72¢ an hour and its questions 5-10¢ each, so the dollar runs out by real
  // spending some time after minute 15: what matters is when, and that nothing is counted that wasn't spent.
  const s = await simulateHour({ windows: 2, every: 2, order: MIX });
  assert.ok(s.worst <= 1 + 1e-9, `the hour never passes $1 (${s.worst})`);
  assert.ok(s.answers <= s.billedUsd + 0.11 * s.cutAttempts + 1e-6, `answers counted ($${s.answers.toFixed(4)}) at most what was billed ($${s.billedUsd.toFixed(4)}) plus each cut attempt's output allowance (${s.cutAttempts})`);
  assert.ok(s.realAtFirstRefusedLook === null || s.realAtFirstRefusedLook >= 0.78, `the looks are refused only once the hour is really spent (first refusal at $${s.realAtFirstRefusedLook})`);
  for (const o of s.capped) assert.ok(o.realBefore >= 0.55, `a cap refusal at minute ${o.minute} with $${o.realBefore.toFixed(4)} really spent`);
  assert.ok(s.outcomes.filter((o) => o.k === 'fetch').every((o) => o.kind !== 'live_cap' || o.realBefore >= 0.55), 'a page fetch gets its own line while the hour has room');
});

test('MONEY-R2-1, MONEY-R2-3: an hour of one window with the live view on and a question every five minutes: questions answered until the hour is really spent, no look refused, never past $1', async () => {
  // The first question in a new chat, the rest in the same chat minutes apart (its prompt cached). Each
  // request still holds its input at the cache-write price (a cold prompt is billed before anything can
  // stop it): by minute 35 this chat's history (its search results) puts that floor near 25¢, and the two
  // cut attempts count all of their max_tokens (16¢ above what was billed), so the later questions wait
  // for the hour with about 64¢ really spent. Before that, every question is answered.
  const s = await simulateHour({ windows: 1, every: 5, order: ['plain', 'twoSearches', 'plain', 'midStream', 'fetch', 'plain', 'threeSearches', 'turnedDown', 'toolRound', 'plain', 'twoSearches', 'plain'], coldEvery: 1000, bothEvery: 0 });
  assert.ok(s.worst <= 1 + 1e-9, `never past $1 (${s.worst})`);
  assert.equal(s.refusedLooks, 0, 'no look refused');
  const first = s.outcomes.findIndex((o) => o.kind === 'live_cap');
  const before = first < 0 ? s.outcomes : s.outcomes.slice(0, first);
  assert.ok(before.length >= 6, `the first ${before.length} questions go out before any refusal`);
  assert.ok(before.every((o) => o.status === 'done' || o.kind === 'live_fetch'), JSON.stringify(before.filter((o) => o.status !== 'done')));
  if (first >= 0) assert.ok(s.outcomes[first].realBefore >= 0.6, `the first refusal comes with $${s.outcomes[first].realBefore.toFixed(4)} really spent`);
});
