// DOM tests for the B3 HUD work, run in real headless Chromium through the repo's unit-test
// harness (test/unit/platform.harness.test.mjs: esbuild bundle + app CSP header + Playwright).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHarness, ROOT } from './platform.harness.test.mjs';

const CSS = ['src/styles/tokens.css', 'src/styles/hud.css'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

let h;
before(async () => {
  h = await createHarness({
    card: 'src/ui/hud/mission-card.js',
    mc: 'src/ui/hud/mission-control.js',
    agent: 'src/ui/hud/agent-card.js',
    comms: 'src/ui/hud/comms.js',
    core: 'src/ui/hud/core.js',
  });
});
after(async () => {
  if (h) await h.close();
});

async function page(opts = {}) {
  const p = await h.newPage(opts);
  await p.addStyleTag({ content: CSS });
  await p.evaluate(() => {
    let n = 0;
    window.mkAgent = (codename, extra = {}) => ({
      id: `a${++n}`, codename, role: `${codename} role`, task: 't', web: true, model: 'claude-sonnet-5-5', status: 'queued', activity: '',
      thinking: '', report: '', sources: [], searches: [], fetches: [], usage: {}, costUsd: 0, attempts: 0, startedAt: null, endedAt: null, error: null, ...extra,
    });
    window.mkMission = (agents, extra = {}) => ({ id: `m${++n}`, wave: 1, title: 'Kyoto in April', createdAt: Date.now() - 5000, startedAt: Date.now() - 4000, endedAt: null, status: 'running', agents, ...extra });
    window.mkTurn = (missions) => ({ id: `t${++n}`, role: 'jarvis', status: 'running', depth: 'balanced', createdAt: Date.now() - 6000, missions: Object.fromEntries(missions.map((m) => [m.id, m])), stats: {}, costUsd: 0 });
  });
  return p;
}

test('mission card: interrupted agents are counted as interrupted, not stopped', async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const m = mkMission([mkAgent('Atlas', { status: 'interrupted' }), mkAgent('Nova', { status: 'interrupted' }), mkAgent('Echo', { status: 'interrupted' })], { status: 'interrupted', endedAt: Date.now() });
    const card = window.__mods.card.createMissionCard(m, {});
    document.body.append(card.el);
    const a = card.el.querySelector('.hud-mission__progress-text').textContent.replace(/ /g, ' ');
    m.agents[0].status = 'done';
    m.agents[1].status = 'stopped';
    card.update(m);
    const b = card.el.querySelector('.hud-mission__progress-text').textContent.replace(/ /g, ' ');
    return { a, b, label: card.el.querySelector('.hud-mission__label').textContent };
  });
  assert.equal(r.a, '0/3 done · 3 interrupted');
  assert.equal(r.b, '1/3 done · 1 stopped · 1 interrupted');
  assert.equal(r.label, 'Mission · Wave 1');
  assert.deepEqual(p.problems, []);
});

test('mission card header never truncates the label (INTERRUPTED at 390/375/320px phones)', async () => {
  const p = await page();
  for (const width of [358, 343, 288]) {
    const r = await p.evaluate((w) => {
      document.body.replaceChildren();
      const out = [];
      for (const status of ['interrupted', 'running', 'partial', 'planning']) {
        const m = mkMission([mkAgent('Atlas', { status: 'interrupted' })], { status, startedAt: Date.now() - 754000 });
        const card = window.__mods.card.createMissionCard(m, {});
        const box = document.createElement('div');
        box.style.width = `${w}px`;
        box.append(card.el);
        document.body.append(box);
        const label = card.el.querySelector('.hud-mission__label');
        const top = card.el.querySelector('.hud-mission__top').getBoundingClientRect();
        const pill = card.el.querySelector('.hud-pill').getBoundingClientRect();
        out.push({ status, clipped: label.scrollWidth > label.clientWidth + 0.5, inside: pill.right <= top.right + 0.5, text: label.innerText });
      }
      return out;
    }, width);
    for (const row of r) {
      assert.equal(row.clipped, false, `${width}px ${row.status}: label clipped ("${row.text}")`);
      assert.equal(row.inside, true, `${width}px ${row.status}: status pill overflows the card`);
    }
    if (width === 358) {
      assert.match(r.find((x) => x.status === 'running').text, /^MISSION · WAVE 1$/i, 'room for the full label at 390px');
      assert.match(r.find((x) => x.status === 'interrupted').text, /^WAVE 1$/i, 'long status: the label drops its prefix');
    }
  }
});

test('mission card celebrates only a live finish, and never under reduced motion', async () => {
  const p = await page();
  const live = await p.evaluate(() => {
    const m = mkMission([mkAgent('Atlas', { status: 'searching' })]);
    const card = window.__mods.card.createMissionCard(m, {});
    document.body.append(card.el);
    m.agents[0].status = 'done';
    m.status = 'done';
    m.endedAt = Date.now();
    card.update(m);
    const restored = window.__mods.card.createMissionCard(mkMission([mkAgent('Nova', { status: 'done' })], { status: 'done', endedAt: Date.now() }), {});
    document.body.append(restored.el);
    restored.update();
    return { live: card.el.classList.contains('is-celebrating'), restored: restored.el.classList.contains('is-celebrating') };
  });
  assert.deepEqual(live, { live: true, restored: false });
  const q = await page({ contextOptions: { reducedMotion: 'reduce' } });
  const reduced = await q.evaluate(() => {
    const m = mkMission([mkAgent('Atlas', { status: 'searching' })]);
    const card = window.__mods.card.createMissionCard(m, {});
    document.body.append(card.el);
    m.agents[0].status = 'done';
    m.status = 'done';
    card.update(m);
    return card.el.classList.contains('is-celebrating');
  });
  assert.equal(reduced, false);
});

test('Mission Control: comms log, filter chips, collapsed on phones / open on desktop, summary strip', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const atlas = mkAgent('Atlas', { status: 'starting', attempts: 1, startedAt: Date.now() - 3000 });
    const vega = mkAgent('Vega', { status: 'queued' });
    const m = mkMission([atlas, vega]);
    const turn = mkTurn([m]);
    const host = document.createElement('div');
    host.style.cssText = 'width:400px;height:800px;display:flex;flex-direction:column';
    document.body.append(host);
    const panel = window.__mods.mc.createMissionControl({ container: host, variant: 'panel' });
    panel.show(turn);
    const sheetHost = document.createElement('div');
    sheetHost.style.cssText = 'width:390px;height:700px;display:flex;flex-direction:column';
    document.body.append(sheetHost);
    const sheet = window.__mods.mc.createMissionControl({ container: sheetHost, variant: 'sheet' });
    sheet.show(turn);
    atlas.searches.push('kyoto ryokan prices april');
    atlas.status = 'searching';
    panel.show(turn);
    atlas.fetches.push('https://www.japan-guide.com/e/e3913.html');
    atlas.status = 'reading';
    panel.show(turn);
    vega.status = 'error';
    vega.error = { kind: 'rate_limit', message: 'Rate limited' };
    atlas.status = 'done';
    atlas.sources = [{ url: 'https://a/1' }];
    atlas.endedAt = Date.now();
    m.status = 'partial';
    m.endedAt = Date.now();
    panel.show(turn);
    sheet.show(turn);
    const root = panel.el.querySelector('[data-testid="comms-log"]');
    const lines = [...root.querySelectorAll('[data-testid="comms-line"]')].map((l) => l.textContent.replace(/^\S+ /, ''));
    const chips = [...root.querySelectorAll('.hud-comms__chip')].map((c) => c.querySelector('.hud-comms__chip-label').textContent);
    root.querySelectorAll('.hud-comms__chip')[2].click(); // Vega
    const visible = [...root.querySelectorAll('[data-testid="comms-line"]')].filter((l) => !l.hidden).map((l) => l.querySelector('.hud-comms__who').textContent);
    return {
      lines,
      chips,
      visible,
      role: root.querySelector('.hud-comms__log').getAttribute('role'),
      panelOpen: root.dataset.open,
      sheetOpen: sheet.el.querySelector('[data-testid="comms-log"]').dataset.open,
      sheetLines: sheet.el.querySelectorAll('[data-testid="comms-line"]').length,
      summary: panel.el.querySelector('[data-testid="mission-summary"]').textContent,
      summaryHidden: panel.el.querySelector('[data-testid="mission-summary"]').hidden,
      cards: panel.el.querySelectorAll('[data-testid="agent-card"]').length,
    };
  });
  assert.deepEqual(r.lines, [
    'WAVE 1 launched · 2 agents — Kyoto in April',
    'ATLAS online · Atlas role',
    'ATLAS searching “kyoto ryokan prices april”',
    'ATLAS reading japan-guide.com/e/e3913.html',
    'ATLAS report filed · 1 source · 3s',
    'VEGA failed: rate limited',
    'WAVE 1 complete · 1/2 agents · 1 failed · 1 search · 1 source · 4s',
  ]);
  assert.deepEqual(r.chips, ['All', 'Atlas', 'Vega']);
  assert.deepEqual([...new Set(r.visible)], ['WAVE 1', 'VEGA']);
  assert.equal(r.role, 'log');
  assert.equal(r.panelOpen, 'true');
  assert.equal(r.sheetOpen, 'false');
  assert.equal(r.sheetLines, 7, 'lines are kept even while the feed is collapsed');
  assert.equal(r.summaryHidden, false);
  assert.equal(r.summary.replace(/\s+/g, ' ').trim(), 'Mission complete · 1/2 agents · 1 failed · 1 search · 1 source · 4s');
  assert.equal(r.cards, 2);
  assert.deepEqual(p.problems, []);
});

test('agent card search log: observed order with times, safe links, hostile text stays text', async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const { observeMission, agentTrail } = window.__mods.comms;
    const t0 = Date.now() - 60000;
    const a = mkAgent('<img src=x onerror="window.__xss=1">', { status: 'starting', attempts: 1, startedAt: t0 });
    const m = mkMission([a], { startedAt: t0 });
    observeMission(m, t0);
    a.searches.push('first <b>query</b>');
    a.status = 'searching';
    observeMission(m, t0 + 7000);
    a.fetches.push('https://www.example.com/some/long/path/that/goes/on/and/on/and/on/and/on/and/on/forever.html?with=query&and=more');
    a.status = 'reading';
    observeMission(m, t0 + 15000);
    a.fetches.push('javascript:alert(1)');
    a.searches.push('second');
    a.status = 'searching';
    observeMission(m, t0 + 36000);
    const card = window.__mods.agent.createAgentCard(a, { expanded: true, getTrail: () => agentTrail(m.id, a.id) });
    const box = document.createElement('div');
    box.style.width = '288px';
    box.append(card.el);
    document.body.append(box);
    const sec = card.el.querySelector('.hud-sec--trail');
    sec.open = true;
    card.update(a);
    const steps = [...sec.querySelectorAll('.hud-trail__step')].map((li) => ({
      kind: li.dataset.kind,
      text: li.querySelector('.hud-trail__text').textContent,
      time: li.querySelector('.hud-trail__time').textContent,
      link: li.querySelector('a') ? [li.querySelector('a').getAttribute('href'), li.querySelector('a').target, li.querySelector('a').rel] : null,
    }));
    const overflow = [...sec.querySelectorAll('*')].some((n) => n.getBoundingClientRect().right > box.getBoundingClientRect().right + 0.5);
    return { steps, count: sec.querySelector('.hud-sec__count').textContent, imgs: document.querySelectorAll('img').length, xss: !!window.__xss, overflow };
  });
  assert.equal(r.count, '2 searches · 2 pages');
  assert.deepEqual(r.steps.map((s) => `${s.kind}|${s.time}`), ['search|0:07', 'read|0:15', 'read|0:36', 'search|0:36']);
  assert.equal(r.steps[0].text, 'Searched “first <b>query</b>”');
  assert.deepEqual(r.steps[1].link.slice(1), ['_blank', 'noopener noreferrer']);
  assert.equal(r.steps[2].link, null, 'a javascript: URL is shown as text, never as a link');
  assert.equal(r.imgs, 0);
  assert.equal(r.xss, false);
  assert.equal(r.overflow, false, 'nothing overflows a 288px-wide card');
});

test('queued agents show why they wait; a retry countdown reads "Retrying" on the card and chip', async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const lined = mkAgent('Nova', { status: 'queued', activity: 'Lined up to start' });
    const plain = mkAgent('Echo', { status: 'queued', activity: '' });
    const retry = mkAgent('Atlas', { status: 'queued', attempts: 1, startedAt: Date.now() - 9000, activity: 'Rate limited — retrying in 12s' });
    const m = mkMission([retry, lined, plain]);
    const card = window.__mods.card.createMissionCard(m, {});
    document.body.append(card.el);
    const cards = [retry, lined, plain].map((a) => window.__mods.agent.createAgentCard(a, {}));
    for (const c of cards) document.body.append(c.el);
    const read = () => cards.map((c) => ({
      status: c.el.dataset.status,
      tone: c.el.dataset.tone,
      pill: c.el.querySelector('.hud-pill__text').textContent,
      activity: c.el.querySelector('.hud-agent__activity-text').textContent,
      refresh: !!c.el.querySelector('.hud-agent__activity-icon .icon-refresh'),
    }));
    const chip = () => {
      const li = card.el.querySelector('[data-testid="agent-chip"]');
      return { status: li.dataset.status, tone: li.dataset.tone, refresh: !!li.querySelector('.icon-refresh'), sr: li.querySelector('.hud-sr').textContent };
    };
    const during = { cards: read(), chip: chip() };
    retry.activity = 'Rate limited — retrying in 11s';
    cards[0].update(retry);
    const tick = cards[0].el.querySelector('.hud-agent__activity-text').textContent;
    retry.status = 'starting';
    retry.attempts = 2;
    retry.activity = 'Starting';
    cards[0].update(retry);
    card.update(m);
    return { during, tick, after: { card: read()[0], chip: chip() } };
  });
  assert.deepEqual(r.during.cards[0], { status: 'queued', tone: 'warn', pill: 'Retrying', activity: 'Rate limited — retrying in 12s', refresh: true });
  assert.deepEqual(r.during.cards[1], { status: 'queued', tone: 'idle', pill: 'Queued', activity: 'Lined up to start', refresh: false });
  assert.equal(r.during.cards[2].activity, 'Waiting for a free slot…', 'no engine text: the old fallback');
  assert.deepEqual(r.during.chip, { status: 'queued', tone: 'warn', refresh: true, sr: ' — Retrying' });
  assert.equal(r.tick, 'Rate limited — retrying in 11s', 'the countdown stays live');
  assert.equal(r.after.card.pill, 'Starting');
  assert.equal(r.after.card.tone, 'active');
  assert.deepEqual(r.after.chip, { status: 'starting', tone: 'active', refresh: false, sr: ' — Starting' });
});

test('header mini orb rests on a static frame after a quiet spell and wakes on any change', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createCore } = window.__mods.core;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const mk = (mode, extra) => {
      const c = document.createElement('canvas');
      c.style.width = mode === 'mini' ? '32px' : '200px';
      document.body.append(c);
      return createCore(c, { mode, ...extra });
    };
    const mini = mk('mini', { idleSleepMs: 300 });
    const orbit = mk('orbit', {});
    const seen = {};
    await sleep(150);
    seen.start = mini.debugStats();
    await sleep(400);
    seen.dozed = mini.debugStats();
    mini.setState('thinking'); // any change wakes it
    await sleep(100);
    seen.woke = mini.debugStats();
    await sleep(500);
    seen.busy = mini.debugStats(); // not resting: never dozes while working
    mini.setState('idle');
    await sleep(450);
    seen.again = mini.debugStats();
    seen.orbit = orbit.debugStats(); // other cores never doze on their own
    mini.destroy();
    orbit.destroy();
    return Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, { awake: v.awake, dozing: v.dozing }]));
  });
  assert.deepEqual(r.start, { awake: true, dozing: false });
  assert.deepEqual(r.dozed, { awake: false, dozing: true });
  assert.deepEqual(r.woke, { awake: true, dozing: false });
  assert.deepEqual(r.busy, { awake: true, dozing: false });
  assert.deepEqual(r.again, { awake: false, dozing: true });
  assert.deepEqual(r.orbit, { awake: true, dozing: false });
});

test('canvas resolution: capped at 2x on phones, up to 3x on desktop', async () => {
  const measure = async (contextOptions) => {
    const p = await page({ contextOptions });
    return p.evaluate(async () => {
      const c = document.createElement('canvas');
      c.style.width = '200px';
      document.body.append(c);
      window.__mods.core.createCore(c, { mode: 'orbit' });
      await new Promise((res) => setTimeout(res, 100));
      return c.width;
    });
  };
  assert.equal(await measure({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }), 400);
  assert.equal(await measure({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 }), 600);
  assert.equal(await measure({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }), 200);
});

test('comms filter chips (even "All") are at least 44×44 on touch screens', async () => {
  const p = await page({ contextOptions: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
  const r = await p.evaluate(() => {
    const m = mkMission([mkAgent('Atlas', { status: 'searching', attempts: 1, startedAt: Date.now() })]);
    const host = document.createElement('div');
    host.style.cssText = 'width:390px;height:800px;display:flex;flex-direction:column';
    document.body.append(host);
    const mc = window.__mods.mc.createMissionControl({ container: host, variant: 'sheet' });
    mc.show(mkTurn([m]));
    mc.el.querySelector('[data-testid="comms-toggle"]').click();
    return [...mc.el.querySelectorAll('.hud-comms__chip')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height)]; });
  });
  for (const [label, w, h] of r) assert.ok(w >= 44 && h >= 44, `${label}: ${w}×${h}`);
});

test('Mission Control re-renders less often while many agents are in flight', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const run = async (n) => {
      const agents = Array.from({ length: n }, (_, i) => mkAgent(`A${i}`, { status: 'searching', attempts: 1, startedAt: Date.now() }));
      const m = mkMission(agents);
      const turn = mkTurn([m]);
      const host = document.createElement('div');
      host.style.cssText = 'width:400px;height:800px;display:flex;flex-direction:column';
      document.body.append(host);
      const mc = window.__mods.mc.createMissionControl({ container: host, variant: 'panel' });
      mc.show(turn);
      const text = () => mc.el.querySelector('[data-testid="agent-card"] .hud-agent__activity-text').textContent;
      const shown = new Set();
      const t0 = performance.now();
      let k = 0;
      while (performance.now() - t0 < 2000) {
        agents[0].activity = `Searching “q${++k}”`;
        mc.update(turn, m);
        shown.add(text());
        await sleep(16);
      }
      mc.destroy();
      host.remove();
      return shown.size;
    };
    return { few: await run(2), many: await run(20) };
  });
  assert.ok(r.few >= 12, `2 agents: ${r.few} renders in 2s (expected about 20)`);
  assert.ok(r.many <= 6, `20 agents: ${r.many} renders in 2s (expected about 4)`);
});

test('core: celebrate() exists on every core (including the no-canvas fallback) and is safe', async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const { createCore } = window.__mods.core;
    const c = document.createElement('canvas');
    c.style.width = '200px';
    document.body.append(c);
    const core = createCore(c, { mode: 'orbit' });
    core.setAgents([mkAgent('Atlas', { status: 'done' })]);
    core.celebrate();
    core.celebrate('warn');
    const fake = { getContext: () => null, classList: { add() {} }, style: { setProperty() {} }, hasAttribute: () => false, getAttribute: () => null, setAttribute() {} };
    const noop = createCore(fake, { mode: 'orbit' });
    noop.celebrate();
    core.destroy();
    core.celebrate(); // after destroy: no-op
    return typeof noop.celebrate;
  });
  assert.equal(r, 'function');
  assert.deepEqual(p.problems, []);
});
