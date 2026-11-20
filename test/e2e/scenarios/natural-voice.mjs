// The natural voice (Kokoro) in the real app with the stand-in model (test/e2e/voice-standin.mjs):
// the real worker, transformers.js, ONNX Runtime WASM, phonemizer and Web Audio, with a tiny graph
// that outputs a tone instead of a voice. Served from dist/models/ like the self-hosted model.
//
//   natural-voice           iPhone 13: Settings card (the download size before anything downloads,
//                           George by default), on -> download -> ready, Test plays it; Voice Mode
//                           replies are spoken by it, not by the built-in voice (the router)
//   natural-voice-webgpu    Mac: a WebGPU adapter -> the card offers the graphics-chip engine
//                           (about 350 MB); its model fails to load -> the processor engine (WASM)
//                           takes over by itself; next time the card offers that one (about 117 MB)
//   natural-voice-test      Test never plays the built-in voice in its place: during the download it
//                           waits, then plays the natural voice; kept as too slow, a natural sample
//   natural-voice-gpu-guard while the main window sets the voice up on the graphics chip, a screen
//                           window or a second tab rules nothing out; a page that died mid-set-up
//                           (lock let go, marker left) still does
//   natural-voice-slow      a device measured too slow: the card says so (Try again), and Voice
//                           Mode's reply is spoken by the built-in voice

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';
import { writeVoiceStandin } from '../voice-standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODELS = path.join(ROOT, 'dist', 'models');

/**
 * In the page: count the natural voice's audio (24 kHz buffers; UI sounds use other rates; the
 * one-sample silent buffer that unlocks audio on iPhone is not speech).
 */
function instrumentAudio() {
  window.__naturalAudio = [];
  const proto = window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype;
  if (!proto) return;
  const start = proto.start;
  proto.start = function (...args) {
    try {
      if (this.buffer && this.buffer.sampleRate === 24000 && this.buffer.length > 240) window.__naturalAudio.push({ at: performance.now(), seconds: this.buffer.duration });
    } catch {
      /* not ours */
    }
    return start.apply(this, args);
  };
}

/** In the page: a WebGPU adapter that the page sees (the worker gets none). */
function fakeWebGpu() {
  const gpu = { requestAdapter: async () => ({ info: { vendor: 'apple', architecture: 'metal-3', isFallbackAdapter: false }, features: new Set(), limits: {} }), getPreferredCanvasFormat: () => 'bgra8unorm' };
  try {
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
  } catch {
    /* read-only */
  }
}

async function setup(t, { gpu = false, brokenFp32 = false, init = null, page = null } = {}) {
  writeVoiceStandin(MODELS, { brokenFp32 });
  if (!page) await t.newPage();
  await t.page.addInitScript(() => {
    try {
      localStorage.setItem('jarvis.dev.voiceStandin', '1');
    } catch {
      /* storage blocked */
    }
  });
  await t.page.addInitScript(installFakeSpeech);
  await t.page.addInitScript(instrumentAudio);
  if (gpu) await t.page.addInitScript(fakeWebGpu);
  if (init) await t.page.addInitScript(init);
  await t.goto('/');
}

async function openVoiceSettings(t) {
  await (await t.visible('settings-button')).click();
  await t.visible('settings-sheet');
  const card = await t.visible('natural-voice-card');
  await card.scrollIntoViewIfNeeded();
  return card;
}

const label = (t) => t.text(t.page.locator(tid('natural-voice-label')));
const status = (t) => t.page.locator(tid('natural-voice-status'));
const audio = (t) => t.page.evaluate(() => window.__naturalAudio.length);
const said = (t) => t.page.evaluate(() => window.__voice.said.slice());

async function waitStatus(t, states, timeout = 90000) {
  await t.waitFor(async () => states.includes(await status(t).getAttribute('data-state')), { timeout, message: async () => `the natural voice to be ${states.join(' or ')} (it is ${await status(t).getAttribute('data-state')}: ${await t.text(status(t))})` });
}

/** Voice Mode: ask the default question by voice and wait until Jarvis has answered and spoken. */
async function voiceTurn(t) {
  await (await t.visible('voice-open')).click();
  await t.visible('voice-mode');
  await t.waitFor(async () => (await t.page.locator(tid('voice-captions')).getAttribute('data-kind')) === 'answer' || (await t.count('turn-jarvis', { 'data-status': 'done' })) > 0, { timeout: 60000, message: 'the spoken answer' });
  await t.waitFor(async () => ['idle', 'listening'].includes(await t.page.locator(tid('voice-mode')).getAttribute('data-state')), { timeout: 60000, message: 'Voice Mode to finish speaking' });
}

export default [
  {
    name: 'natural-voice',
    title: 'Natural voice (stand-in model): the card shows the download size first and George by default; on -> download -> ready; Test plays it; Voice Mode replies are spoken by it, not the built-in voice',
    device: 'iphone13',
    timeout: 180000,
    async run(t) {
      await setup(t);
      await openVoiceSettings(t);
      await t.step('before anything downloads: the size of the engine this device runs (no WebGPU here: the processor, about 117 MB); George is the speaker', async () => {
        await t.waitFor(async () => /^Natural voice \(free, downloads about 117 MB\)$/.test(await label(t)), { timeout: 10000, message: async () => `the size in the label (${await label(t)})` });
        const help = await t.text(t.page.locator('#set-naturalVoice-help'));
        t.assert(/If it’s too slow, Jarvis uses the built-in voice\./.test(help), `help: ${help}`);
        t.assert((await t.page.locator(tid('setting-naturalVoiceId')).inputValue()) === 'bm_george', 'George by default');
        t.assert((await t.page.locator(tid('setting-naturalVoice')).isChecked()) === false, 'off until the owner turns it on');
        await t.page.waitForTimeout(200);
        await t.screenshot('card-off');
      });
      await t.step('on: it downloads (progress) and gets ready; nothing is spoken by the built-in voice', async () => {
        await t.page.locator(tid('setting-naturalVoice')).click();
        await waitStatus(t, ['ready']);
        const text = await t.text(status(t));
        t.assert(/^Ready\. Replies use the natural voice/.test(text), `status: ${text}`);
        t.assert((await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1')).naturalVoice)) === true, 'the setting is saved');
        await t.screenshot('card-ready');
      });
      await t.step('Test natural voice plays it through Web Audio', async () => {
        const before = await audio(t);
        await t.page.locator(tid('natural-voice-test')).click();
        await t.waitFor(async () => (await audio(t)) > before, { timeout: 20000, message: 'the natural voice to play' });
        t.assert(!(await said(t)).some((s) => /All systems are operational/.test(s)), 'not the built-in voice');
      });
      await t.step('Voice Mode: the reply is spoken by the natural voice (the router), with captions; the core\'s voice band follows its output', async () => {
        await t.page.keyboard.press('Escape');
        await t.waitFor(async () => (await t.count('settings-sheet')) === 0, { timeout: 5000, message: 'Settings to close' });
        const before = await audio(t);
        // Watch for Voice Mode's hook: data-bands="output" while the natural voice's bands drive the core.
        await t.page.evaluate(() => {
          window.__bandsSeen = false;
          new MutationObserver(() => {
            if (document.querySelector('[data-testid="voice-mode"][data-bands="output"]')) window.__bandsSeen = true;
          }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-bands'] });
        });
        await voiceTurn(t);
        t.assert((await audio(t)) > before, 'the answer was played by the natural voice');
        t.assert((await said(t)).length === 0, `the built-in voice said nothing (${JSON.stringify(await said(t))})`);
        t.assert(await t.page.evaluate(() => window.__bandsSeen), "the core's voice band followed the natural voice's output bands while it spoke");
        t.assert((await t.page.locator(tid('voice-mode')).getAttribute('data-bands')) === null, 'and let go once it stopped');
        t.note(`${(await audio(t)) - before} natural-voice chunks in the spoken reply`);
      });
      await t.step('Reset Jarvis deletes the natural voice download too (v7.1: before, up to ~445 MB stayed on the device)', async () => {
        const voiceCaches = () => t.page.evaluate(async () => (await caches.keys()).filter((n) => ['transformers-cache', 'kokoro-voices', 'voice-runtime-v1'].includes(n)).sort());
        t.assert((await voiceCaches()).includes('transformers-cache'), `the download is in Cache Storage before the reset (${await voiceCaches()})`);
        await t.page.locator(tid('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        const reset = t.page.locator(tid('reset-app'));
        await reset.scrollIntoViewIfNeeded();
        await reset.click();
        await Promise.all([t.page.waitForEvent('load', { timeout: 20000 }), reset.click()]); // "Tap again to erase everything": the app reloads
        const left = await voiceCaches();
        t.assert(left.length === 0, `no natural voice cache is left (${JSON.stringify(left)})`);
      });
    },
  },
  {
    name: 'natural-voice-webgpu',
    title: 'Natural voice on a Mac with WebGPU: the card offers the graphics-chip engine (about 350 MB); when it fails to load, the processor engine takes over by itself, and next time the card offers that one',
    device: 'mac',
    timeout: 180000,
    async run(t) {
      await setup(t, { gpu: true, brokenFp32: true });
      await openVoiceSettings(t);
      await t.step('WebGPU: the card shows the graphics-chip engine and its size before anything downloads', async () => {
        await t.waitFor(async () => /^Natural voice \(free, downloads about 350 MB\)$/.test(await label(t)), { timeout: 10000, message: async () => `the WebGPU size (${await label(t)})` });
        const help = await t.text(t.page.locator('#set-naturalVoice-help'));
        t.assert(/graphics chip \(WebGPU\)/.test(help) && /If it’s too slow, Jarvis uses the built-in voice\./.test(help), `help: ${help}`);
        await t.screenshot('card-webgpu');
      });
      await t.step('the graphics-chip model fails to load: the processor engine (WASM) loads by itself and is ready', async () => {
        await t.page.locator(tid('setting-naturalVoice')).click();
        await waitStatus(t, ['ready', 'error']);
        const text = await t.text(status(t));
        t.assert(/^Ready on the processor \(the graphics chip couldn’t run it\)\. Replies use the natural voice/.test(text), `status: ${text}`);
        t.assert(/^Natural voice \(free, downloads about 117 MB\)$/.test(await label(t)), `the card now describes the engine in use (${await label(t)})`);
        const verdict = await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.voice.natural.webgpu') || 'null'));
        t.assert(verdict && verdict.failed === true, `kept: ${JSON.stringify(verdict)}`);
        await t.screenshot('card-fallback-ready');
      });
      await t.step('next time: the card offers the processor engine and its size', async () => {
        await t.reload();
        await openVoiceSettings(t);
        await t.waitFor(async () => /^Natural voice \(free, downloads about 117 MB\)$/.test(await label(t)), { timeout: 10000, message: async () => `the WASM size (${await label(t)})` });
      });
    },
  },
  {
    name: 'natural-voice-gpu-guard',
    title: 'Natural voice crash guard (Mac): while the main window sets the voice up on the graphics chip, a screen window or a second Jarvis tab rules nothing out; a page that died mid-set-up still does',
    device: 'mac',
    timeout: 120000,
    settings: { naturalVoice: true },
    async run(t) {
      await setup(t, { gpu: true });
      const page = t.page;
      const verdict = () => page.evaluate(() => localStorage.getItem('jarvis.voice.natural.webgpu'));
      const marker = () => page.evaluate(() => localStorage.getItem('jarvis.voice.natural.attempt'));
      // The main window is setting the natural voice up on the graphics chip right now: its marker
      // (refreshed while it runs) and the set-up lock it holds meanwhile.
      await page.evaluate(() => {
        localStorage.setItem('jarvis.voice.natural.attempt', JSON.stringify({ device: 'webgpu', phase: 'compile', at: Date.now(), owner: 'the-main-window' }));
        navigator.locks.request('jarvis-voice-gpu-setup', { mode: 'shared' }, () => new Promise((resolve) => (window.__releaseGpu = resolve)));
      });
      const open = async (url) => {
        const p = await page.context().newPage();
        t.attachPageGuards(p);
        await p.goto(new URL(url, `${t.url}/`).href, { waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(2500);
        return p;
      };
      await t.step('a screen window ("put the answer on my other screen") opens meanwhile: no verdict', async () => {
        const screen = await open('/?screen=answer&w=other&n=2&s=sx1');
        t.assert(!(await verdict()), `no WebGPU verdict (${await verdict()})`);
        t.assert(JSON.parse(await marker()).owner === 'the-main-window', "the main window's marker stays");
        await screen.close();
      });
      await t.step('a second Jarvis tab with the natural voice on asks which engine: no verdict', async () => {
        const tab = await open('/');
        t.assert(!(await verdict()), `no WebGPU verdict (${await verdict()})`);
        t.assert(!!(await marker()), 'the marker stays');
        await tab.close();
      });
      // (The Settings card opened on the page that is setting up is unit-tested in natural.webgpu: a
      // click here would start this page's own engine.)
      await t.step('the main window dies mid-set-up (its lock let go, its marker left behind): the next page rules WebGPU out', async () => {
        await page.evaluate(() => window.__releaseGpu());
        const next = await open('/');
        const v = JSON.parse((await verdict()) || 'null');
        t.assert(v && v.failed === true && v.code === 'crashed', `a crash verdict (${JSON.stringify(v)})`);
        t.assert(!(await marker()), 'the marker is gone');
        await next.close();
      });
    },
  },
  {
    name: 'natural-voice-test',
    title: 'Test natural voice never plays the built-in voice in its place: tapped during the download it waits and then plays the natural voice; on a device kept as too slow it makes a natural sample and plays that',
    device: 'iphone13',
    timeout: 180000,
    async run(t) {
      // The model download is held for 6 s (a slow connection): Test is tapped meanwhile.
      await t.newPage();
      await t.page.context().route(/model_quantized\.onnx/, async (route) => {
        await new Promise((r) => setTimeout(r, 6000));
        await route.continue().catch(() => {});
      });
      await setup(t, { page: t.page });
      await openVoiceSettings(t);
      await t.step('during the download: Test waits (the status says so) and the built-in voice says nothing', async () => {
        await t.page.locator(tid('setting-naturalVoice')).click();
        await waitStatus(t, ['downloading', 'starting', 'loading'], 15000);
        await t.page.locator(tid('natural-voice-test')).click();
        await t.page.waitForTimeout(1500);
        t.assert(!(await said(t)).some((x) => /All systems are operational/.test(x)), `not the built-in voice (${JSON.stringify(await said(t))})`);
        t.assert((await audio(t)) === 0, 'nothing played yet');
        t.assert(/The test plays as soon as the natural voice is ready\.$/.test(await t.text(status(t))), `the status says the test waits (${await t.text(status(t))})`);
        t.assert((await t.text(t.page.locator(tid('natural-voice-test')))) === 'Cancel test', 'a second tap cancels it');
        await t.screenshot('test-waiting');
      });
      await t.step('ready: the waiting test plays in the natural voice', async () => {
        await waitStatus(t, ['ready']);
        await t.waitFor(async () => (await audio(t)) > 0, { timeout: 30000, message: 'the natural voice to play the test' });
        t.assert(!(await said(t)).some((x) => /All systems are operational/.test(x)), 'never the built-in voice');
        await t.waitFor(async () => (await t.text(t.page.locator(tid('natural-voice-test')))) === 'Test natural voice', { timeout: 15000, message: 'the button back to Test' });
      });
      await t.step('a device kept as too slow: Test makes a natural sample and plays it (replies stay on the built-in voice)', async () => {
        await t.page.evaluate(() => localStorage.setItem('jarvis.voice.natural.verdict', JSON.stringify({ slow: true, rtf: 1.4, at: Date.now() })));
        await t.reload();
        await openVoiceSettings(t);
        await t.waitFor(async () => /^Too slow on this device \(1\.4× real time\)/.test(await t.text(status(t))), { timeout: 10000, message: async () => `the slow text (${await t.text(status(t))})` });
        const before = await audio(t);
        await t.page.locator(tid('natural-voice-test')).click();
        await t.waitFor(async () => (await audio(t)) > before, { timeout: 60000, message: 'the natural sample to play' });
        t.assert(!(await said(t)).some((x) => /All systems are operational/.test(x)), `not the built-in voice (${JSON.stringify(await said(t))})`);
      });
    },
  },
  {
    name: 'natural-voice-slow',
    title: 'Natural voice measured too slow on this device: the card says so (Try again); Voice Mode replies are spoken by the built-in voice',
    device: 'iphone13',
    timeout: 120000,
    settings: { naturalVoice: true },
    async run(t) {
      await setup(t, { init: () => localStorage.setItem('jarvis.voice.natural.verdict', JSON.stringify({ slow: true, rtf: 2.6, at: Date.now() })) });
      await openVoiceSettings(t);
      await t.step('the card says it is too slow here and offers Try again', async () => {
        await t.waitFor(async () => /^Too slow on this device \(2\.6× real time\), so Jarvis uses the built-in voice\.$/.test(await t.text(status(t))), { timeout: 10000, message: async () => `the slow text (${await t.text(status(t))})` });
        t.assert(await t.page.locator(tid('natural-voice-retry')).isVisible(), 'Try again');
        await t.screenshot('card-slow');
      });
      await t.step('Voice Mode: the built-in voice speaks the reply; the natural voice never starts', async () => {
        await t.page.keyboard.press('Escape');
        await t.waitFor(async () => (await t.count('settings-sheet')) === 0, { timeout: 5000, message: 'Settings to close' });
        await voiceTurn(t);
        t.assert((await said(t)).length > 0, 'the built-in voice spoke');
        t.assert((await audio(t)) === 0, 'no natural-voice audio');
      });
    },
  },
];
