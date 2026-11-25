// v7.8.1 (integrator): George's stuck sound after a stall, and no false handovers. The review of v7.8.1 wrote
// these as probes (review-busy, review-idle, review-recover, review-wake); they are kept here as scenarios.
//
//   george-busy            George speaks while the main thread is blocked twice for 3 s and the page is hidden
//                          for 1.5 s: no handover to the iPhone voice, no kick
//   george-idle-resume     a reply after our own 30 s idle suspend (no tap): play() resumes the context; no
//                          handover, no kick
//   george-stuck-recover   George's sound stuck: Settings → Home base → Hearing and voice → Test says plainly
//                          that nothing played (review L2; it said "Played"); once the sound works again,
//                          without a tap, George is back by the second reply (review M3; before, every reply
//                          stayed on the iPhone voice until a tap); a Speak tap: George
//   george-stuck-wake      George's sound stuck in Voice Mode, "Jarvis, standby", two wakes with no tap since:
//                          each greeting on the iPhone voice at once (review M2; before, each waited 3.5 s
//                          for George first)
//
// The second review's probes, kept as scenarios (each failed on aa0b53b, build 2f785fe1):
//   george-stuck-tap-early  Voice Mode, George's sound stuck: the core tapped 2.5 s into the silence, before the
//                          3.5 s handover, counts as a stall: the next reply on the iPhone voice at once (before,
//                          George was tried again, 3.5 s of silence, until a reply was left alone)
//   george-stuck-replaced  after a stall the sound works again and George comes back by himself on the context
//                          that stalled; the next idle tap (Speak) starts his sound afresh (before, no tap ever
//                          replaced that context: if iOS leaves it running but silent, George stays silent)
//   george-test-george-off George's sound stuck in its first context (a fresh one plays), George switched off on
//                          this iPhone: Hearing and voice → Test starts it afresh and plays (before, "Nothing
//                          played" at every tap until George was switched back on)
//   george-test-hidden     Hearing and voice → Test with Jarvis in the background for the whole sample: no
//                          verdict, in words (before, "Played …"), and George isn't marked stuck

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import { setHidden } from './optics.mjs';
import * as S from '../../unit/wake.signals.mjs';

const pad = (x, before = 0.4, after = 0.9) => S.concat(S.silence(before), x, S.silence(after));
const DOUBLE_CLAP = Array.from(pad(S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10 })));
const QUESTION = 'What is the capital of France?';
const GEORGE = { settings: { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'auto' } };

/**
 * Init script: the voice's 24 kHz AudioContexts, logged (suspend/resume calls with their state and clock, chunk
 * starts with the index of their context) and optionally stuck (suspended at birth; resume() resolves and nothing
 * runs): every one until lift() (`stuck`), or only the first one, for good (`stuckFirst`: a fresh one plays).
 * window.__audio: { on, contexts (every one made, newest last), starts, log, lift() }.
 */
function installAudioProbe({ stuck = false, stuckFirst = false } = {}) {
  const Real = window.AudioContext || window.webkitAudioContext;
  if (!Real) return;
  const st = { on: stuck, contexts: [], starts: [], log: [] };
  window.__audio = st;
  class ProbeAudioContext extends Real {
    constructor(opts) {
      super(opts);
      this.__voice = !!opts && opts.sampleRate === 24000;
      if (!this.__voice) return;
      this.__stuck = stuckFirst && st.contexts.length === 0;
      st.contexts.push(this);
      this.addEventListener('statechange', () => st.log.push({ t: performance.now(), ev: 'state', state: this.state, cur: this.currentTime }));
      if (st.on || this.__stuck) super.suspend().catch(() => {});
    }
    suspend() {
      if (this.__voice) st.log.push({ t: performance.now(), ev: 'suspend', state: this.state, cur: this.currentTime });
      return super.suspend();
    }
    resume() {
      if (this.__voice) st.log.push({ t: performance.now(), ev: 'resume', state: this.state, cur: this.currentTime, stuck: st.on || !!this.__stuck });
      if (this.__voice && (st.on || this.__stuck)) return Promise.resolve();
      return super.resume();
    }
  }
  window.AudioContext = ProbeAudioContext;
  if (window.webkitAudioContext) window.webkitAudioContext = ProbeAudioContext;
  st.lift = () => {
    st.on = false;
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...rest) {
    try {
      if (this.context && this.context.__voice && this.buffer && this.buffer.length > 1) st.starts.push({ when: Number(when) || 0, at: this.context.currentTime, duration: this.buffer.duration, t: performance.now(), ctx: st.contexts.indexOf(this.context) });
    } catch {
      /* bookkeeping only */
    }
    return start.call(this, when, ...rest);
  };
}

async function prep(page, { stuck = false, stuckFirst = false, mic = false } = {}) {
  await page.addInitScript(installFakeSpeech, { noSpeechMs: 900 });
  if (mic) await page.addInitScript(installFakeMic, { wakeLock: true });
  await page.addInitScript(() => {
    window.__voice.queue = [];
    window.__labels = [];
    const seen = new WeakMap();
    const note = () => {
      for (const el of document.querySelectorAll('[data-testid="voice-label"], [data-testid="turn-speak-voice"]')) {
        const v = el.hidden ? '' : (el.textContent || '').trim();
        if (seen.get(el) !== v) {
          seen.set(el, v);
          if (v) window.__labels.push({ t: performance.now(), label: `${el.dataset.testid}:${v}` });
        }
      }
    };
    new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await page.addInitScript(installAudioProbe, { stuck, stuckFirst });
}

async function openListening(t) {
  await (await t.visible('voice-open')).click();
  const vm = await t.visible('voice-mode');
  await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 10000, message: 'Voice Mode to listen' });
  await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.listens)) >= 1, { timeout: 8000, message: 'the recognizer' });
  return vm;
}

const probe = (t) => t.page.evaluate(() => ({ starts: window.__audio.starts.slice(), log: window.__audio.log.slice(), said: window.__voice.said.slice(), saidLog: window.__voice.log.map((e) => ({ at: e.at, text: e.text })), labels: window.__labels.slice(), now: performance.now(), ctx: window.__audio.contexts.map((c) => ({ state: c.state, cur: c.currentTime })) }));

/** Settings → Home base → Hearing and voice (the card). */
async function openHearingAndVoice(t) {
  await (await t.visible('settings-button')).click();
  await t.visible('settings-sheet');
  await t.page.evaluate(() => document.querySelector('#settings-homebase')?.scrollIntoView());
  const card = await t.visible('senses-settings');
  await card.scrollIntoViewIfNeeded();
  return card;
}

/** A question in the chat, its answer read aloud (Speak replies on): which voice said it, and on which contexts. */
async function readTurn(t, q) {
  const before = await probe(t);
  const asked = t.core.senses.speaks.length;
  const turn = await t.send(q);
  await t.waitForTurn(turn, ['done'], { timeout: 60000 });
  await t.page.waitForTimeout(6000);
  await t.waitFor(async () => !(await t.page.locator(tid('turn-speak-voice')).last().isVisible()), { timeout: 40000, message: 'read to the end' });
  const p = await probe(t);
  const on = [...new Set(p.starts.slice(before.starts.length).map((s) => s.ctx))];
  return `${p.said.length > before.said.length ? `iPhone voice (George asked ${t.core.senses.speaks.length - asked})` : 'George'} (George’s chunks on contexts ${JSON.stringify(on)})`;
}

export default [
  {
    name: 'george-busy',
    title: 'George speaks while the main thread is blocked twice for 3 s and the page is hidden for 1.5 s: no handover to the iPhone voice, no kick',
    device: 'iphone13',
    seed: GEORGE,
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await prep(t.page);
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      const vm = await openListening(t);
      await t.page.evaluate((q) => window.__voice.say(q), QUESTION);
      await t.page.waitForFunction(
        () => {
          const a = window.__audio;
          const c = a.contexts[0];
          return !!c && a.starts.length > 0 && c.currentTime >= a.starts[0].when + 0.3;
        },
        null,
        { timeout: 30000, polling: 20 },
      );
      const t0 = await t.page.evaluate(() => performance.now());
      for (const ms of [3000, 3000]) {
        await t.page.evaluate((ms) => {
          const end = performance.now() + ms;
          while (performance.now() < end) {
            /* a big render or a hologram build */
          }
        }, ms);
        await t.page.waitForTimeout(400);
      }
      await setHidden(t.page, true);
      await t.page.waitForTimeout(1500);
      await setHidden(t.page, false);
      await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 60000, message: 'done speaking' });
      const p = await probe(t);
      const kicks = p.log.filter((e) => e.t >= t0 && ((e.ev === 'suspend' && e.state === 'running') || e.ev === 'resume'));
      t.note(`George chunks ${p.starts.length}; iPhone voice said ${p.said.length}; suspend/resume calls after the first block ${kicks.length}`);
      t.assert(p.said.length === 0, `no handover to the iPhone voice (${JSON.stringify(p.said)})`);
      t.assert(!p.labels.some((l) => /iPhone voice/.test(l.label)), `the label stayed George (${p.labels.map((l) => l.label).join(' | ')})`);
      t.assert(kicks.length === 0, `no kick (${JSON.stringify(kicks)})`);
      t.assert(t.core.senses.speaks.some((x) => /travel brief/.test(x.text)), 'George said the whole reply');
    },
  },
  {
    name: 'george-idle-resume',
    title: 'A reply after our own 30 s idle suspend (no tap): play() resumes George’s context; no handover, no kick',
    device: 'iphone13',
    seed: { settings: { ...GEORGE.settings, speakReplies: 'summary' } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 200000,
    async run(t) {
      await t.newPage();
      await prep(t.page);
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      const turn1 = await t.send(QUESTION); // the first click unlocks audio
      await t.waitForTurn(turn1, ['done'], { timeout: 60000 });
      await t.waitFor(async () => (await t.page.evaluate(() => window.__audio.starts.length)) > 0, { timeout: 20000, message: 'George reads the first reply' });
      await t.waitFor(async () => (await t.page.evaluate(() => window.__audio.contexts[0]?.state)) === 'suspended', { timeout: 90000, interval: 500, message: 'our own idle suspend (30 s after the last chunk)' });
      const before = await probe(t);
      const t1 = before.now;
      const turn2 = await t.send('What is the capital of Germany?'); // a click on Send: not an unlock any more (one-shot)
      await t.waitForTurn(turn2, ['done'], { timeout: 60000 });
      await t.waitFor(async () => t.page.evaluate((n) => window.__audio.starts.length > n, before.starts.length), { timeout: 20000, message: 'George reads the second reply' });
      await t.page.waitForTimeout(12000);
      const p = await probe(t);
      const first = p.starts[before.starts.length];
      const running = p.log.find((e) => e.ev === 'state' && e.state === 'running' && e.t >= t1);
      const kicks = p.log.filter((e) => e.t >= t1 && e.ev === 'suspend' && e.state === 'running');
      t.note(`resumed ${running ? Math.round(running.t - first.t) : 'never'} ms after the first chunk was put on the clock; iPhone voice ${p.said.length}; suspend-while-running ${kicks.length}`);
      t.assert(!!running && running.t - first.t < 1500, 'resumed by play() well before the kick');
      t.assert(p.said.length === 0, `no handover (${JSON.stringify(p.said)})`);
      t.assert(kicks.length === 0, `no kick (${JSON.stringify(kicks)})`);
      t.assert(p.ctx.length === 1, `one context all along (${JSON.stringify(p.ctx)})`);
    },
  },
  {
    name: 'george-stuck-recover',
    title: 'George’s sound stuck: Hearing and voice → Test says plainly that nothing played; once the sound works again, with no tap, George is back by the second reply; a Speak tap: George',
    device: 'iphone13',
    seed: { settings: { ...GEORGE.settings, speakReplies: 'summary' } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 200000,
    async run(t) {
      await t.newPage();
      await prep(t.page, { stuck: true });
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      await t.step('the first reply stalls: the iPhone voice', async () => {
        const turn = await t.send(QUESTION);
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.length)) > 0, { timeout: 20000, message: 'the iPhone voice after the stall' });
        await t.waitFor(async () => !(await t.page.locator(tid('turn-speak-voice')).last().isVisible()), { timeout: 40000, message: 'read to the end' });
      });
      await t.step('Settings → Home base → Hearing and voice → Test while the sound is stuck: it says nothing played', async () => {
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        await t.page.evaluate(() => document.querySelector('#settings-homebase')?.scrollIntoView());
        const card = await t.visible('senses-settings');
        await card.scrollIntoViewIfNeeded();
        await card.locator(tid('senses-speak-test')).click();
        const result = card.locator(tid('senses-speak-result'));
        await t.waitFor(async () => /Played|played|couldn/.test(await t.text(result)), { timeout: 20000, message: 'the test to end' });
        const text = await t.text(result);
        const p = await probe(t);
        const last = p.ctx[p.ctx.length - 1];
        t.note(`Hearing and voice Test: “${text}”; voice contexts ${JSON.stringify(p.ctx)}`);
        t.assert(text === 'Nothing played: George’s sound didn’t start on this iPhone, so the iPhone voice speaks for now. Tap Test to try again.', `said plainly (“${text}”; before the fix: “Played …” while the voice clock stood at 0)`);
        t.assert((await result.getAttribute('data-tone')) === 'warn', 'as a warning');
        t.assert(p.ctx.length === 2 && p.ctx[0].state === 'closed' && last.cur === 0, `the tap started a fresh context, stuck too here (${JSON.stringify(p.ctx)})`);
        await (await t.visible('settings-close')).click();
        await t.page.locator(tid('settings-sheet')).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      });
      await t.step('the sound works again (resume() resumes): the next two replies, with no tap', async () => {
        await t.page.evaluate(() => window.__audio.lift());
        const voices = [];
        for (const q of ['What is the capital of Germany?', 'What is the capital of Spain?']) {
          const n = await t.page.evaluate(() => window.__voice.said.length);
          const asked = t.core.senses.speaks.length;
          const turn = await t.send(q);
          await t.waitForTurn(turn, ['done'], { timeout: 60000 });
          await t.page.waitForTimeout(6000);
          const p = await probe(t);
          voices.push(p.said.length > n ? `iPhone voice (George asked ${t.core.senses.speaks.length - asked} times)` : 'George');
          await t.waitFor(async () => !(await t.page.locator(tid('turn-speak-voice')).last().isVisible()), { timeout: 40000, message: 'read to the end' });
        }
        const ctx = (await probe(t)).ctx;
        t.note(`once the sound works again: ${voices.join('; ')}; the voice contexts ${JSON.stringify(ctx)}`);
        t.assert(voices[0] === 'iPhone voice (George asked 0 times)', `the first at once on the iPhone voice, which asks George’s output to run (${voices[0]})`);
        t.assert(voices[1] === 'George', `George is back by himself by the second reply (${voices.join('; ')}; context ${JSON.stringify(ctx)}; before the fix: both on the iPhone voice, the context still suspended)`);
      });
      await t.step('a Speak tap: George', async () => {
        const asked = t.core.senses.speaks.length;
        const n = await t.page.evaluate(() => window.__voice.said.length);
        await t.page.locator(tid('turn-speak')).last().click();
        await t.waitFor(async () => t.core.senses.speaks.length > asked, { timeout: 15000, message: 'George asked' });
        await t.page.waitForTimeout(6000);
        const said = await t.page.evaluate((n) => window.__voice.said.slice(n), n);
        t.note(`after a Speak tap: ${said.length ? 'iPhone voice' : 'George'}`);
        t.assert(said.length === 0, `George reads it (${JSON.stringify(said)})`);
      });
    },
  },
  {
    name: 'george-stuck-wake',
    title: 'George’s sound stuck in Voice Mode; "Jarvis, standby", a wake, "go back to sleep", a second wake (no tap since the stall): each greeting on the iPhone voice at once',
    device: 'iphone13',
    seed: GEORGE,
    fakeCore: { senses: { speak: 'ready' } },
    fakeMusic: true,
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await prep(t.page, { stuck: true, mic: true });
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      const greetings = [];
      await t.step('a Voice Mode reply stalls: the sound is known stuck; then "Jarvis, standby." (no tap)', async () => {
        const vm = await openListening(t);
        await t.page.evaluate((q) => window.__voice.say(q), QUESTION);
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.length)) > 0, { timeout: 30000, message: 'the iPhone voice after the stall' });
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 40000, message: 'listening again' });
        await t.page.evaluate(() => window.__voice.say('Jarvis, standby.'));
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 20000 });
        await t.visible('standby', { timeout: 10000 });
        await t.waitFor(async () => (await t.page.evaluate(() => document.querySelector('[data-testid="standby"]')?.dataset.listening)) === 'live', { timeout: 15000, message: 'Standby listening' });
      });
      const wake = async (label) => {
        const before = await probe(t);
        await t.page.evaluate((x) => window.__fakeMic.play(x), DOUBLE_CLAP);
        await t.visible('voice-mode', { timeout: 8000, message: 'two claps wake Jarvis' });
        const openedAt = await t.page.evaluate(() => performance.now());
        await t.waitFor(async () => (await probe(t)).saidLog.some((e) => e.at >= before.now && /Shall I put on some|Or I can run your/.test(e.text)), { timeout: 30000, message: 'the greeting' });
        const p = await probe(t);
        const greet = p.saidLog.find((e) => e.at >= before.now && /Shall I put on some|Or I can run your/.test(e.text));
        const georgeTry = p.starts.find((s) => s.t >= before.now);
        const wait = georgeTry ? greet.at - georgeTry.t : 0;
        greetings.push({ label, sinceOpen: Math.round(greet.at - openedAt), georgeTried: !!georgeTry, waitedForGeorge: Math.round(wait), contexts: p.ctx.length });
      };
      await t.step('first wake: no tap since the stall', async () => {
        await wake('first wake (no tap since the stall)');
      });
      await t.step('"No, go back to sleep." then a second wake, still no tap', async () => {
        await t.waitFor(async () => (await t.page.evaluate(() => document.querySelector('[data-testid="voice-mode"]')?.getAttribute('data-state'))) === 'listening', { timeout: 30000, message: 'listening for the answer' });
        await t.page.evaluate(() => window.__voice.say('No, go back to sleep.'));
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 30000 });
        await t.visible('standby', { timeout: 10000 });
        await t.waitFor(async () => (await t.page.evaluate(() => document.querySelector('[data-testid="standby"]')?.dataset.listening)) === 'live', { timeout: 15000, message: 'Standby listening again' });
        await wake('second wake (no tap)');
      });
      t.note(greetings.map((g) => `${g.label}: greeting ${g.sinceOpen} ms after Voice Mode opened; George tried first: ${g.georgeTried} (${g.waitedForGeorge} ms of silence)`).join(' / '));
      t.assert(greetings.every((g) => !g.georgeTried), `with no tap since the stall, each wake greets on the iPhone voice at once (${JSON.stringify(greetings)}; before the fix: George tried first each time, 3.5 s of silence)`);
      t.assert(greetings.every((g) => g.sinceOpen < 2500), `promptly (${JSON.stringify(greetings)})`);
      t.assert(greetings.every((g) => g.contexts === 1), `no context replaced without a tap (${JSON.stringify(greetings)})`);
    },
  },
  {
    name: 'george-stuck-tap-early',
    title: 'Voice Mode, George’s sound stuck: the core tapped 2.5 s into the silence (before the 3.5 s handover) counts as a stall: the next reply on the iPhone voice at once',
    device: 'iphone13',
    seed: GEORGE,
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 200000,
    async run(t) {
      await t.newPage();
      await prep(t.page, { stuck: true });
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      const vm = await openListening(t);
      const rows = [];
      const turn = async (q, { tapAfterMs = null } = {}) => {
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 40000, message: 'listening' });
        const listens = await t.page.evaluate(() => window.__voice.listens);
        const before = await probe(t);
        const asked = t.core.senses.speaks.length;
        await t.page.evaluate((x) => window.__voice.say(x), q);
        await t.waitFor(
          async () => {
            const p = await probe(t);
            return p.starts.length > before.starts.length || p.said.length > before.said.length;
          },
          { timeout: 30000, interval: 50, message: 'George’s first chunk on the clock, or the iPhone voice' },
        );
        const p1 = await probe(t);
        const chunk = p1.starts.length > before.starts.length ? p1.starts[before.starts.length] : null;
        let tapped = false;
        if (chunk && tapAfterMs !== null) {
          await t.page.waitForTimeout(Math.max(0, chunk.t + tapAfterMs - p1.now));
          if ((await probe(t)).said.length === before.said.length) {
            await t.page.locator(tid('voice-core')).click(); // "try again": the reply stops and Voice Mode listens
            tapped = true;
          }
        }
        if (!tapped) await t.waitFor(async () => (await probe(t)).said.length > before.said.length, { timeout: 15000, interval: 50, message: 'the iPhone voice' });
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening' && (await t.page.evaluate(() => window.__voice.listens)) > listens, { timeout: 40000, message: 'listening again' });
        const p3 = await probe(t);
        const firstSaid = p3.saidLog[before.saidLog.length];
        const row = { q, georgeAsked: t.core.senses.speaks.length - asked, georgeTried: !!chunk, tapped, iPhoneVoice: firstSaid ? (chunk ? `${((firstSaid.at - chunk.t) / 1000).toFixed(2)} s after George’s chunk was due` : 'at once') : 'nothing (cancelled by the tap)' };
        rows.push(row);
        return row;
      };
      const first = await turn(QUESTION, { tapAfterMs: 2500 });
      const second = await turn('What is the capital of Germany?');
      t.note(rows.map((r) => `${r.q} George asked ${r.georgeAsked}, tried ${r.georgeTried}, tapped ${r.tapped}, iPhone voice: ${r.iPhoneVoice}`).join(' | '));
      t.assert(first.georgeTried && first.tapped, `the first reply was tapped in George’s silence, before the handover (${JSON.stringify(first)})`);
      t.assert(!second.georgeTried && second.georgeAsked === 0 && second.iPhoneVoice === 'at once', `the next reply on the iPhone voice at once, George not tried (${JSON.stringify(second)}; before the fix: George tried again, 3.5 s of silence)`);
    },
  },
  {
    name: 'george-stuck-replaced',
    title: 'After a stall the sound works again and George comes back by himself on the context that stalled; the next idle tap (Speak) starts his sound afresh',
    device: 'iphone13',
    seed: { settings: { ...GEORGE.settings, speakReplies: 'summary' } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await prep(t.page, { stuck: true });
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      const notes = [];
      const q1 = await readTurn(t, QUESTION);
      notes.push(`Q1 (stuck): ${q1}`);
      t.assert(/^iPhone voice/.test(q1), `the stall hands over (${q1})`);
      await t.page.evaluate(() => window.__audio.lift()); // the sound works again
      const q2 = await readTurn(t, 'What is the capital of Germany?');
      const q3 = await readTurn(t, 'What is the capital of Spain?');
      notes.push(`Q2: ${q2}`, `Q3: ${q3}`);
      t.assert(q3 === 'George (George’s chunks on contexts [0])', `George back by himself, on the context that stalled (${q3})`);
      // An idle tap: Speak on the first reply (nothing is being said).
      const before = await probe(t);
      await t.page.locator(tid('turn-speak')).first().click();
      await t.waitFor(async () => (await probe(t)).starts.length > before.starts.length, { timeout: 15000, message: 'George reads it' });
      await t.page.waitForTimeout(4000);
      const p = await probe(t);
      const on = [...new Set(p.starts.slice(before.starts.length).map((s) => s.ctx))];
      notes.push(`after an idle Speak tap: George’s chunks on contexts ${JSON.stringify(on)}; contexts ${JSON.stringify(p.ctx.map((c) => c.state))}; iPhone voice ${p.said.length - before.said.length}`);
      t.note(notes.join(' | '));
      t.assert(p.ctx.length === 2 && p.ctx[0].state === 'closed', `the tap replaced the context that had stalled (${JSON.stringify(p.ctx)}; before the fix: kept for good, so if iOS left it running but silent, George stayed silent)`);
      t.assert(on.length === 1 && on[0] === 1, `George read it on the fresh context (${JSON.stringify(on)})`);
      t.assert(p.said.length === before.said.length, 'George, not the iPhone voice');
    },
  },
  {
    name: 'george-test-george-off',
    title: 'George’s sound stuck in its first context (a fresh one plays), George switched off on this iPhone: Hearing and voice → Test starts it afresh and plays',
    device: 'iphone13',
    seed: { settings: { ...GEORGE.settings, speakReplies: 'summary' } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 200000,
    async run(t) {
      await t.newPage();
      await prep(t.page, { stuckFirst: true });
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      const rows = [];
      const q1 = await readTurn(t, QUESTION);
      rows.push(`first reply: ${q1}`);
      t.assert(/^iPhone voice/.test(q1), `the stall hands over (${q1})`);
      const card = await openHearingAndVoice(t);
      const result = card.locator(tid('senses-speak-result'));
      const status = () => t.page.evaluate(() => document.querySelector('[data-testid="senses-speak-status"]')?.dataset.state || '');
      await card.locator(tid('senses-speak-toggle')).click(); // George off on this iPhone; the home base keeps him
      await t.waitFor(async () => (await status()) === 'ready-elsewhere', { timeout: 10000, message: 'off here' });
      const test = async (label) => {
        const btn = card.locator(tid('senses-speak-test'));
        await t.waitFor(async () => !(await btn.isDisabled()), { timeout: 10000, message: 'Test enabled' });
        const asked = t.core.senses.speaks.length;
        await btn.click();
        await t.waitFor(async () => t.core.senses.speaks.length > asked, { timeout: 10000, message: 'POST api/speak' });
        await t.waitFor(async () => /^(Played|Nothing played|Couldn)/.test(await t.text(result)), { timeout: 25000, message: 'the verdict' });
        const text = await t.text(result);
        const p = await probe(t);
        rows.push(`${label}: “${text.slice(0, 24)}…” (contexts ${JSON.stringify(p.ctx.map((c) => c.state))})`);
        return { text, ctx: p.ctx };
      };
      const one = await test('George off, Test 1');
      const two = await test('George off, Test 2');
      t.note(rows.join(' | '));
      t.assert(/^Played/.test(one.text), `the Test’s tap starts the stuck sound afresh with George off here too (${rows.join(' | ')}; before the fix: “Nothing played” at every tap)`);
      t.assert(one.ctx.length === 2 && one.ctx[0].state === 'closed', `one fresh context (${JSON.stringify(one.ctx)})`);
      t.assert(/^Played/.test(two.text) && two.ctx.length === 2, `again, on the same fresh context (${JSON.stringify(two.ctx)})`);
    },
  },
  {
    name: 'george-test-hidden',
    title: 'Hearing and voice → Test with Jarvis in the background for the whole sample (its voice context stopped, as iOS does): no verdict, said in words, and George isn’t marked stuck',
    device: 'iphone13',
    seed: GEORGE,
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await prep(t.page);
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      const card = await openHearingAndVoice(t);
      const result = card.locator(tid('senses-speak-result'));
      await card.locator(tid('senses-speak-test')).click();
      await t.waitFor(async () => /^Playing/.test(await t.text(result)), { timeout: 10000, message: 'playing' });
      const at = await t.page.evaluate(() => {
        const c = window.__audio.contexts[window.__audio.contexts.length - 1];
        Object.getPrototypeOf(Object.getPrototypeOf(c)).suspend.call(c); // iOS stops Jarvis's audio as it leaves
        return c.currentTime;
      });
      await setHidden(t.page, true);
      await t.page.waitForTimeout(6000);
      const whileHidden = await t.text(result);
      const tone = await result.getAttribute('data-tone');
      const clock = await t.page.evaluate(() => window.__audio.contexts[window.__audio.contexts.length - 1].currentTime);
      await setHidden(t.page, false);
      await t.page.waitForTimeout(500);
      const card2 = await t.page.evaluate(() => {
        const el = document.querySelector('[data-testid="jarvis-voice-pending"]');
        return { found: !!el, stuck: !!el && !el.hidden && el.dataset.state === 'stuck' };
      });
      t.note(`clock ${at.toFixed(2)} → ${clock.toFixed(2)} s while hidden; the card: “${whileHidden}” (${tone}); Jarvis’s voice says George is stuck: ${card2.stuck}`);
      t.assert(whileHidden === 'Couldn’t tell whether it played: Jarvis was in the background during the test. Tap Test to try again.', `no claim either way (“${whileHidden}”; before the fix: “Played …”, though nothing played)`);
      t.assert(tone === 'info', `as information (${tone})`);
      t.assert(card2.found && !card2.stuck, `and George isn’t marked stuck for it (${JSON.stringify(card2)})`);
    },
  },
];
