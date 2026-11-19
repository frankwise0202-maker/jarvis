// Feature pack v1.1 (SPEC §14), wired in by wave B (SPEC §15): protocols, follow-up chips and
// themes; records (stats, share sheet, mission dossier, Systems dashboard); Voice Mode.

import { readFile } from 'node:fs/promises';
import { tid } from '../harness.mjs';
import { openMissionControl } from './chat.mjs';

const TERMINAL = ['done', 'stopped', 'error', 'interrupted'];

async function waitForNewTurn(t, before, message) {
  await t.waitFor(async () => (await t.count('turn-jarvis')) > before, { timeout: 10000, message });
  return t.page.locator(tid('turn-jarvis')).nth(before);
}

/** The text of the newest user message sent to the lead model (its last text block). */
function lastLeadUserText(t) {
  const lead = t.requests('lead').at(-1);
  const msgs = lead?.body?.messages || [];
  const user = [...msgs].reverse().find((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'text'));
  return user ? user.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
}

/**
 * Deterministic speech for headless Chromium (no microphone, no voices): the recognizer "hears"
 * window.__voice.queue items one per listen (then reports no speech), and the synthesizer
 * "speaks" each utterance in ~120 ms, recording what was said in window.__voice.said.
 */
function installFakeSpeech() {
  const voice = { queue: ['What is the capital of France?'], said: [], listens: 0 };
  window.__voice = voice;
  class FakeRecognition {
    constructor() {
      this.lang = 'en-US';
      this.interimResults = false;
      this.continuous = false;
      this.maxAlternatives = 1;
      this.onresult = this.onerror = this.onend = this.onstart = this.onnomatch = null;
      this.done = false;
    }
    start() {
      voice.listens += 1;
      const phrase = voice.queue.shift();
      setTimeout(() => this.onstart && this.onstart({ type: 'start' }), 20);
      setTimeout(() => {
        if (this.done) return;
        if (phrase) {
          const alt = [{ transcript: phrase, confidence: 0.96 }];
          alt.isFinal = true;
          this.onresult && this.onresult({ type: 'result', resultIndex: 0, results: [alt] });
        } else {
          this.onerror && this.onerror({ type: 'error', error: 'no-speech' });
        }
        this.end();
      }, phrase ? 500 : 900);
    }
    end() {
      if (this.done) return;
      this.done = true;
      setTimeout(() => this.onend && this.onend({ type: 'end' }), 30);
    }
    stop() {
      this.end();
    }
    abort() {
      if (!this.done) setTimeout(() => this.onerror && this.onerror({ type: 'error', error: 'aborted' }), 0);
      this.end();
    }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;

  class FakeUtterance {
    constructor(text) {
      this.text = text == null ? '' : String(text);
      this.lang = '';
      this.voice = null;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.onstart = this.onend = this.onerror = this.onboundary = this.onpause = this.onresume = this.onmark = null;
    }
    addEventListener() {}
    removeEventListener() {}
  }
  window.SpeechSynthesisUtterance = FakeUtterance;

  const queue = [];
  let current = null;
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null,
    getVoices: () => [{ name: 'Daniel', lang: 'en-GB', voiceURI: 'fake-daniel', localService: true, default: true }],
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      queue.push(u);
      synth.pending = queue.length > 0;
      if (!current) next();
    },
    cancel() {
      queue.length = 0;
      const u = current;
      current = null;
      synth.speaking = synth.pending = false;
      if (u) setTimeout(() => u.onerror && u.onerror({ type: 'error', error: 'interrupted', utterance: u }), 0);
    },
    pause() {},
    resume() {},
  };
  function next() {
    current = queue.shift() || null;
    synth.pending = queue.length > 0;
    synth.speaking = !!current;
    if (!current) return;
    const u = current;
    if (u.text) voice.said.push(u.text);
    setTimeout(() => current === u && u.onstart && u.onstart({ type: 'start', utterance: u }), 10);
    setTimeout(() => {
      if (current !== u) return;
      u.onend && u.onend({ type: 'end', utterance: u });
      next();
    }, u.text ? 120 : 5);
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
}

export default [
  {
    name: 'feature-pack',
    title: 'Protocols (tile → input → swarm run), follow-up chips that send, theme switching that persists',
    device: 'desktop',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.visible('empty-state');

      await t.step('protocols (SPEC §14.2)', async () => {
        const grid = await t.visible('protocol-grid', { message: 'The empty state shows the Protocols grid' });
        const tiles = grid.locator(tid('protocol-tile'));
        const ids = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
        t.assert(ids.length >= 8, `The grid should show the 8 built-in protocols (found ${ids.length})`);
        t.assert(ids.every(Boolean) && new Set(ids).size === ids.length, 'Every protocol tile needs a unique data-id');
        for (const id of ['morning-briefing', 'deep-research', 'compare-decide', 'fact-check']) t.assert(ids.includes(id), `Built-in protocol "${id}" is missing`);
        await t.visible('protocol-add', { message: 'The grid offers a "New protocol" tile' });

        const tile = grid.locator(tid('protocol-tile', { 'data-id': 'deep-research' }));
        await tile.scrollIntoViewIfNeeded();
        await tile.click();
        const input = await t.visible('protocol-input', { message: 'Deep Research opens an input row' });
        // Running with an empty input is refused with a hint (no turn starts).
        await t.page.locator(tid('protocol-run')).click();
        await t.page.waitForTimeout(200);
        t.assert((await t.count('turn-jarvis')) === 0, 'Running a protocol without its input must not start a turn');
        await input.fill('black holes');
        await t.screenshot('1-protocol-input');
        await t.page.locator(tid('protocol-run')).click();
        const turn = await waitForNewTurn(t, 0, 'the protocol run to start a Jarvis turn');

        const user = t.page.locator(tid('turn-user')).first();
        await user.locator(tid('protocol-bubble')).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
          throw new Error('The user message of a protocol run renders as a protocol bubble');
        });
        t.assert(/Deep research: black holes/.test(await t.text(user)), 'The protocol bubble shows the headline "Deep research: black holes"');
        t.assert(/swarm/i.test(await t.text(user.locator('.turn-mode'))), 'Deep Research runs in Swarm mode (the user turn is tagged Swarm)');
        t.assert((await t.page.locator(tid('mode-auto')).getAttribute('aria-pressed')) === 'true', 'A protocol run must not change the composer mode');
        await t.waitForTurn(turn, ['done'], { timeout: 90000 });
        const sent = lastLeadUserText(t);
        t.assert(/Protocol: Deep Research/.test(sent) && /Mode: swarm/.test(sent), 'The lead request carries the protocol brief and Mode: swarm');
        t.note(`protocols: ${ids.length} tiles, deep-research run`);
      });

      await t.step('follow-up chips (SPEC §14.5)', async () => {
        const turn = await t.send('What is the capital of France?');
        await t.waitForTurn(turn, ['done']);
        const box = turn.locator(tid('followups'));
        await box.locator(tid('followup')).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
          throw new Error('Follow-up chips should appear under the finished reply');
        });
        t.assert((await t.count('followups')) === 1, 'Only the latest reply shows follow-up chips');
        const chips = box.locator(tid('followup'));
        const texts = (await chips.allTextContents()).map((x) => x.trim());
        t.assert(texts.length >= 1 && texts.length <= 3, `Show 1-3 follow-up chips (got ${texts.length})`);
        t.assert(texts.every((x) => x.length > 0 && x.length <= 70), 'Follow-up chips hold short questions (≤ 70 characters)');
        const structured = t.requests('structured');
        t.assert(structured.length >= 1 && structured.every((r) => r.status === 200 && r.body.model === 'claude-haiku-5-5' && r.body.stream !== true), 'Follow-ups come from a non-streaming claude-haiku-5-5 structured-output request');
        await t.screenshot('2-followups');
        const before = await t.count('turn-jarvis');
        await chips.first().click();
        const next = await waitForNewTurn(t, before, 'tapping a follow-up to send it');
        t.assert((await t.text(t.page.locator(tid('turn-user')).last())) === texts[0], 'The tapped follow-up is sent as the next message');
        await t.waitFor(async () => (await box.count()) === 0, { timeout: 3000, message: 'the previous follow-up chips to go away once one is sent' });
        await t.waitForTurn(next, ['done']);
        t.note(`follow-ups: ${texts.length} chips`);
      });

      await t.step('themes (SPEC §14.3)', async () => {
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        const picker = await t.visible('theme-picker', { message: 'Settings → Appearance shows the theme picker' });
        await picker.scrollIntoViewIfNeeded();
        const swatches = picker.locator(tid('theme-swatch'));
        t.assert((await swatches.count()) >= 6, 'At least 6 themes');
        const before = await t.page.evaluate(() => document.documentElement.dataset.theme || 'arc');
        t.assert(before === 'arc', `The default theme is Arc (got ${before})`);
        await picker.locator(`${tid('theme-swatch')}[data-id="ember"]`).click();
        await t.waitFor(async () => (await t.page.evaluate(() => document.documentElement.dataset.theme)) === 'ember', { timeout: 3000, message: '<html data-theme="ember">' });
        t.assert((await picker.locator(`${tid('theme-swatch')}[data-id="ember"]`).getAttribute('aria-checked')) === 'true', 'The chosen swatch is checked');
        const meta = await t.page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'));
        t.assert(meta && meta !== '#04070c', `The theme-color meta follows the theme (got ${meta})`);
        await t.page.waitForTimeout(500);
        await t.screenshot('3-theme-settings');
        await (await t.visible('settings-close')).click();
        await t.reload();
        t.assert((await t.page.evaluate(() => document.documentElement.dataset.theme)) === 'ember', 'The theme persists across a reload');
        await t.page.waitForTimeout(400);
        await t.screenshot('4-theme-ember');
        t.note('themes: arc → ember (persists)');
      });
    },
  },

  {
    name: 'records',
    title: 'Records: a [[swarm:4]] turn is counted, Share → dossier download with 4 agent sections, Systems shows 4 agents',
    device: 'iphone13',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[swarm:4]] Compare the best electric SUVs of 2026', { mode: 'swarm' });
      await t.waitForTurn(turn, ['done'], { timeout: 120000 });
      const codenames = await turn.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-codename')));
      t.assert(codenames.length === 4, `4 agents expected, got ${codenames.length}`);

      await t.step('stats are recorded when the turn ends', async () => {
        const stats = await t.waitFor(async () => {
          const s = await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.stats.v1') || 'null'));
          return s && s.totals && s.totals.turns >= 1 ? s : null;
        }, { timeout: 5000, message: 'jarvis.stats.v1 to record the turn' });
        t.assert(stats.totals.agents === 4 && stats.totals.missions === 1, `Stats should count 4 agents in 1 mission (got ${JSON.stringify(stats.totals)})`);
      });

      await t.step('share sheet and dossier download', async () => {
        const share = turn.locator(tid('turn-share'));
        await share.scrollIntoViewIfNeeded();
        await share.click();
        const sheet = await t.visible('share-sheet', { message: 'Share opens the Share & export sheet' });
        const actions = await sheet.locator(tid('share-option')).evaluateAll((els) => els.map((e) => e.getAttribute('data-action')));
        t.assert(['answer', 'dossier', 'dossier-download', 'conversation-download'].every((a) => actions.includes(a)), `Share options: ${actions.join(', ')}`);
        await t.page.waitForTimeout(400);
        await t.screenshot('1-share-sheet');
        const [download] = await Promise.all([t.page.waitForEvent('download', { timeout: 10000 }), sheet.locator(`${tid('share-option')}[data-action="dossier-download"]`).click()]);
        const name = download.suggestedFilename();
        t.assert(/\.md$/.test(name), `The dossier downloads as Markdown (got ${name})`);
        const md = await readFile(await download.path(), 'utf8');
        const heads = md.split('\n').filter((l) => /^### \S+ · /.test(l));
        t.assert(heads.length === 4, `The dossier has one "### Codename · Role" section per agent (got ${heads.length}: ${heads.join(' | ')})`);
        for (const c of codenames) t.assert(heads.some((l) => l.startsWith(`### ${c} · `)), `The dossier has a section for ${c}`);
        t.assert(!/undefined|NaN|\[object Object\]/.test(md), 'The dossier has no undefined/NaN placeholders');
        await t.page.locator(tid('share-sheet')).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
          throw new Error('The share sheet closes after a successful export');
        });
      });

      await t.step('Systems dashboard', async () => {
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        const open = t.page.locator(tid('open-systems'));
        await open.scrollIntoViewIfNeeded();
        await open.click();
        const sheet = await t.visible('stats-sheet', { message: 'Settings → Systems dashboard opens the Systems sheet' });
        const total = sheet.locator(tid('stats-total-agents'));
        await t.waitFor(async () => (await total.getAttribute('data-value')) === '4', { timeout: 5000, message: 'stats-total-agents[data-value="4"]' });
        await t.waitFor(async () => (await t.text(total)) === '4', { timeout: 5000, message: 'the agent counter to count up to 4' });
        await t.screenshot('2-systems');
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('stats-sheet')).waitFor({ state: 'hidden', timeout: 5000 });
        t.assert(await t.page.locator(tid('settings-sheet')).isVisible(), 'Escape closes Systems and returns to Settings');
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('settings-sheet')).waitFor({ state: 'hidden', timeout: 5000 });
      });

      await t.step('Mission Control → share this mission', async () => {
        await openMissionControl(t, turn);
        await (await t.visible('mission-share', { message: 'The Mission Control sheet has a share button' })).click();
        await t.visible('share-options', { message: 'Sharing from Mission Control opens the share sheet' });
        await t.screenshot('3-mission-share');
      });
    },
  },

  {
    name: 'voice-mode',
    title: 'Voice Mode: open from the header, a spoken question is answered aloud, a typed one too, then close',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.goto('/');
      await (await t.visible('voice-open', { message: 'The header offers Voice Mode' })).click();
      const vm = await t.visible('voice-mode', { message: 'Voice Mode opens full screen' });

      await t.step('a spoken question (fake recognizer) is sent and the answer spoken', async () => {
        const turn = await waitForNewTurn(t, 0, 'the spoken question to start a turn');
        await t.screenshot('1-thinking');
        await t.waitForTurn(turn, ['done']);
        t.assert(/capital of France/.test(lastLeadUserText(t)), 'The recognized words were sent to Jarvis');
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).includes('Paris'), { timeout: 15000, message: 'Voice Mode to speak the answer (mentioning Paris)' });
        await t.waitFor(async () => ['listening', 'idle'].includes(await vm.getAttribute('data-state')), { timeout: 15000, message: 'Voice Mode to listen again after speaking (continuous)' });
      });

      await t.step('a typed question in Voice Mode', async () => {
        const toggle = await t.visible('voice-type-toggle');
        await toggle.click();
        const input = await t.visible('voice-input');
        await input.fill('Thanks. And what about Germany, what is its capital?');
        await t.screenshot('2-typing');
        const before = await t.count('turn-jarvis');
        await (await t.visible('voice-send')).click();
        const turn = await waitForNewTurn(t, before, 'the typed question to start a turn');
        await t.waitFor(async () => ['thinking', 'working', 'speaking'].includes(await vm.getAttribute('data-state')) || TERMINAL.includes(await turn.getAttribute('data-status')), { timeout: 10000, message: 'Voice Mode to show the turn' });
        await t.waitForTurn(turn, ['done']);
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).includes('Berlin'), { timeout: 15000, message: 'Voice Mode to speak the second answer (Berlin)' });
        await t.screenshot('3-answered');
      });

      await t.step('close', async () => {
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {
          throw new Error('voice-close should remove the Voice Mode overlay');
        });
        t.assert((await t.count('turn-jarvis')) === 2, 'Both voice turns are in the conversation');
        await t.visible('composer-input', { message: 'The chat is usable again after Voice Mode closes' });
        await t.screenshot('4-closed');
      });
    },
  },
];
