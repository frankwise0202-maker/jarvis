// Walkthroughs (v8.1, SPEC §29; Track 2: B1, B3-B6) against the mock: the generic 14-inch laptop
// ([[hologram:laptop]], test/mock/walkthrough.mjs) toured by voice in Voice Mode and by typed words,
// keys and the tour bar in the viewer. State is read from the viewer's test hooks (data-tour-step,
// data-tour-status, data-tour-hold, data-glow, data-ghost, data-hide, data-exploded, data-flying),
// recorded with their times in the page (recordTour) so the order of things is checked after the fact.
//
//   tour-local-part       "walk me through the battery": apart and the battery, the question, "enclosed",
//                         then (back at the question) "opened"; nothing sent to the API
//   tour-local-object     "walk me through it" on a phone: every group's step said and shown in order;
//                         the bar keeps the count and the buttons, the words are the caption
//   tour-words            the tour's words by the fake microphone (repeat, back, wait, continue, previous,
//                         say that again, skip to the fan, that's enough), then "back" turns the model
//                         again; no request to the mock
//   tour-bar-keys         typed "walk me through the battery" (no Voice Mode: the words move on by
//                         estimate), → ← Space, a touch pausing, the bar's buttons, Esc ending the tour
//                         first and closing on the second press; the bar's height never changes
//   tour-enclosed-view    the battery glowing inside the closed, see-through case (a screenshot to look
//                         at), then opened with the bottom cover hidden
//   tour-hidden           the page hidden mid-tour: paused, Voice Mode's hold let go; shown: it goes on
//   tour-george-sync      George from a fake home base: each step shown within 300 ms of its words
//   tour-device-voice     the device's voice with start events (each step while its first sentence is said)
//                         and without (never before its words, within the 3 s assumption)
//   tour-decision-voice   at the question, "what does that do?" is one paid turn about the glowing
//                         battery and the tour waits; Voice Mode keeps listening; "enclosed" by voice
//   tour-question-mid     a question typed mid-tour: one request whose turn context says what is on
//                         screen (the walkthrough's step, the glowing part)

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import { installFakeSpeech } from './features.mjs';

const LAPTOP = '[[hologram:laptop]] Show me a laptop.';
const QUESTION = 'Do you want to see it enclosed, or opened?';
const PART_STEPS = { overview: "Here's the 14-inch laptop, assembled.", apart: 'Taken apart, this is the battery.' };
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---- helpers ---------------------------------------------------------------------------------------

const viewerAttr = (t, name, page = t.page) => page.locator(tid('hologram-viewer')).getAttribute(`data-${name}`);
async function waitViewer(t, name, value, { timeout = 30000, message, page = t.page } = {}) {
  const ok = (v) => (typeof value === 'function' ? value(v) : v === value);
  await t.waitFor(async () => ok(await viewerAttr(t, name, page)), { timeout, message: message || (async () => `the viewer's data-${name} to be ${typeof value === 'function' ? 'right' : `"${value}"`} (is "${await viewerAttr(t, name, page)}")`) });
}
const waitStep = (t, step, opts = {}) => waitViewer(t, 'tour-step', step, { timeout: 30000, ...opts });
const waitStatus = (t, status, opts = {}) => waitViewer(t, 'tour-status', status, { timeout: 30000, ...opts });

/** In the page: every change of the viewer's tour and emphasis hooks, with its time (performance.now()). */
function recordTour() {
  const log = [];
  window.__tour = { log };
  const fields = ['tourStep', 'tourShown', 'tourStatus', 'tourHold', 'tourView', 'tourIndex', 'tourTotal', 'glow', 'ghost', 'hide', 'exploded', 'flying'];
  let last = '';
  const note = () => {
    const el = document.querySelector('[data-testid="hologram-viewer"]');
    if (!el) return;
    const e = {};
    for (const f of fields) e[f] = el.dataset[f] || '';
    const key = JSON.stringify(e);
    if (key === last) return;
    last = key;
    log.push({ at: performance.now(), ...e });
  };
  const attrs = ['data-tour-step', 'data-tour-shown', 'data-tour-status', 'data-tour-hold', 'data-tour-view', 'data-tour-index', 'data-tour-total', 'data-glow', 'data-ghost', 'data-hide', 'data-exploded', 'data-flying', 'data-tour'];
  new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: attrs });
}
const tourLog = (t, page = t.page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__tour.log)));
/** The steps shown, in order (each run of the same step once). */
const stepsOf = (log) => log.map((e) => e.tourStep).filter((s, i, a) => s && s !== a[i - 1]);
/** When the viewer first showed `step`'s look (after `from`), or -1: data-tour-shown, which changes when its words begin. */
const shownAt = (log, step, from = -Infinity) => (log.find((e) => e.tourShown === step && e.at >= from) || { at: -1 }).at;
const voice = (t, page = t.page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__voice)));
const leadCount = (t) => t.requests('lead').length;

/** The newest owner message (with text) of a request body, and its turn context. */
function newestUserMessage(body) {
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  return [...msgs].reverse().find((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'text')) || null;
}
function newestTurnContext(body) {
  const msg = newestUserMessage(body);
  return msg ? (msg.content.find((b) => b.type === 'text' && /<turn_context>/.test(b.text)) || {}).text || '' : '';
}
function newestUserText(body) {
  const msg = newestUserMessage(body);
  return msg ? msg.content.filter((b) => b.type === 'text' && !/<turn_context>/.test(b.text)).map((b) => b.text).join('\n') : '';
}

/**
 * Voice Mode with the laptop over it: the fake recognizer hears LAPTOP, then `queue` (one item a listen;
 * '' a listen that hears nobody). speech: installFakeSpeech's options (cps paces the device voice).
 */
async function voiceLaptop(t, { queue = [], speech = {}, page = null } = {}) {
  const p = page || (await t.newPage());
  await p.addInitScript(installFakeSpeech, { cps: 40, ...speech });
  await p.addInitScript((q) => {
    window.__voice.queue = q;
  }, [LAPTOP, ...queue]);
  await p.addInitScript(recordTour);
  await t.goto('/', { page: p });
  await (await t.visible('voice-open', { page: p })).click();
  await t.visible('hologram-viewer', { page: p, timeout: 30000, message: 'The laptop opens over Voice Mode' });
  await waitViewer(t, 'state', 'ready', { timeout: 60000, page: p });
  t.assert((await viewerAttr(t, 'parts', p)) === '16', `the laptop's 16 parts (got ${await viewerAttr(t, 'parts', p)})`);
  return p;
}

/** The laptop from the chat (no Voice Mode): sent, built, then its viewer opened from the card. */
async function chatLaptop(t) {
  await t.newPage();
  await t.page.addInitScript(recordTour);
  await t.goto('/');
  await t.send(LAPTOP);
  const turn = t.page.locator(tid('turn-jarvis')).last();
  await t.waitForTurn(turn, ['done'], { timeout: 60000 });
  await turn.locator(tid('hologram-open')).first().click();
  await waitViewer(t, 'state', 'ready', { timeout: 60000 });
  t.assert((await viewerAttr(t, 'parts')) === '16', 'the laptop is open');
}

/**
 * Say `words` to Voice Mode: heard at its next listen. Once it has stopped listening (two silent listens
 * after a step), a tap on the viewer's mic (Voice Mode's talk button) listens.
 */
async function sayNow(t, words) {
  const before = (await voice(t)).queue.length;
  await t.page.evaluate((w) => window.__voice.queue.push(w), words);
  const heard = async () => (await voice(t)).queue.length <= before;
  try {
    await t.waitFor(heard, { timeout: 3500, message: 'heard' });
  } catch {
    const st = await t.page.locator(tid('voice-mode')).getAttribute('data-state');
    if (st === 'idle') await t.page.locator(tid('hologram-mic')).click();
    await t.waitFor(heard, { timeout: 8000, message: `"${words}" to be heard` });
  }
}

/** Type in the viewer's command field and press Enter. */
async function typeCommand(t, text) {
  const input = t.page.locator(tid('hologram-command'));
  await input.fill(text);
  await input.press('Enter');
}

/** The bar's box (its height must not change while a tour runs). */
const barBox = (t) => t.page.evaluate(() => {
  const b = document.querySelector('[data-testid="tour-bar"]');
  const r = b ? b.getBoundingClientRect() : null;
  return r ? { height: Math.round(r.height), top: Math.round(r.top) } : null;
});

/**
 * In the page: each piece of George's audio, in order, with the audio-clock time it starts at, and samples
 * of that clock against performance.now() (a page under load can run its audio clock slower than the wall
 * clock, so a start is read off the clock as it went, not worked out when it was scheduled).
 */
function recordGeorgeAudio() {
  const starts = [];
  const samples = [];
  window.__george = { starts, samples };
  let sampler = 0;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...rest) {
    try {
      const ctx = this.context;
      if (ctx && ctx.sampleRate === 24000 && this.buffer && this.buffer.length > 1) {
        starts.push({ when: Math.max(Number(when) || 0, ctx.currentTime), duration: this.buffer.duration });
        const sample = () => samples.push({ perf: performance.now(), t: ctx.currentTime });
        sample();
        if (!sampler) sampler = setInterval(sample, 20);
      }
    } catch {
      /* bookkeeping only */
    }
    return start.call(this, when, ...rest);
  };
}

/** When (performance.now()) George's audio clock reached each piece's start, from the page's samples; -1 if it never did. */
function georgeStarts({ starts, samples }) {
  const wallAt = (when) => {
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (b.t < when) continue;
      return b.t > a.t ? a.perf + ((when - a.t) / (b.t - a.t)) * (b.perf - a.perf) : b.perf;
    }
    return -1;
  };
  return starts.map((s) => ({ at: wallAt(s.when), duration: s.duration }));
}

/** Decode a PNG screenshot (8-bit RGB or RGBA) into { width, height, data: RGBA }. */
async function decodePng(buf) {
  const { inflateSync } = await import('node:zlib');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = line[x * bpp];
      out[(y * width + x) * 4 + 1] = line[x * bpp + 1];
      out[(y * width + x) * 4 + 2] = line[x * bpp + 2];
      out[(y * width + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

/**
 * Bright pixels (luma over 150: a glowing part's light; the rest of the hologram is dim on the dark
 * stage) between `top` and `bottom`, leaving out `skip` boxes (a label's white text is bright too),
 * and their centre. As tour-render's own check (test/e2e/scenarios/tour-render.mjs).
 */
async function brightLight(png, { top = 0, bottom = Infinity, skip = [] } = {}) {
  const { width, data } = await decodePng(png);
  let bright = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    if (y < top || y > bottom || skip.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) continue;
    if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] > 150) {
      bright++;
      sx += x;
      sy += y;
    }
  }
  return { bright, centre: bright ? { x: Math.round(sx / bright), y: Math.round(sy / bright) } : null };
}

/** Where the battery's label leader points (the battery on screen) and the label's box, in page pixels. */
const batteryAnchor = (t) =>
  t.page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('[data-testid="hologram-viewer"] .holo-label.is-shown')).find((l) => l.textContent.trim() === 'Battery (57 Wh)');
    const dot = label && document.querySelector(`circle.holo-anchor[data-key="${label.dataset.key}"]`);
    if (!dot) return null;
    const r = dot.getBoundingClientRect();
    const b = label.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: { left: b.left - 4, top: b.top - 4, right: b.right + 4, bottom: b.bottom + 4 } };
  });

// ---- scenarios -------------------------------------------------------------------------------------

export default [
  {
    name: 'tour-local-part',
    title: 'Laptop, "walk me through the battery" in Voice Mode: it comes apart and the battery glows, then "Do you want to see it enclosed, or opened?" with the bar\'s four choices; "enclosed": back together, the case see-through, the battery glowing where it sits; back at the question, "opened": the bottom cover hidden, the camera on the battery from its side; nothing sent to the API for any of it',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await voiceLaptop(t, { queue: ['Walk me through the battery.', 'Enclosed.'] });
      const lead = await t.waitFor(async () => (leadCount(t) >= 2 ? leadCount(t) : null), { timeout: 30000, message: 'the hologram reply' });
      await t.step('overview, then apart with the battery glowing, then the question', async () => {
        await waitStep(t, 'apart');
        await waitViewer(t, 'exploded', '1');
        await waitViewer(t, 'glow', 'battery');
        await waitStatus(t, 'choice');
        const bar = await t.visible('tour-bar');
        t.assert((await bar.getAttribute('data-decision')) === 'true', 'the bar shows the decision');
        const choices = await t.page.locator(tid('tour-choice')).evaluateAll((els) => els.map((e) => [e.dataset.choice, e.textContent.trim()]));
        t.assert(JSON.stringify(choices) === JSON.stringify([['enclosed', 'Enclosed'], ['opened', 'Opened'], ['both', 'Both'], ['pick', 'You pick']]), `the four choices (${JSON.stringify(choices)})`);
        t.assert(norm(await t.text(t.page.locator(tid('tour-words')))) === QUESTION, 'the question in the bar');
        const said = norm((await voice(t)).said.join(' | '));
        t.assert(said.includes(PART_STEPS.overview) && said.includes(PART_STEPS.apart), `the steps were said (${said})`);
        t.assert(said.indexOf(PART_STEPS.apart) < said.indexOf(QUESTION), `then the question (${said})`);
        const order = stepsOf(await tourLog(t));
        t.assert(JSON.stringify(order.slice(0, 3)) === JSON.stringify(['overview', 'apart', 'ask']), `in the owner's order (${order.join(' → ')})`);
        await t.screenshot('1-apart-question');
      });
      await t.step('"enclosed": back together, the case see-through, the battery glowing where it sits', async () => {
        await waitStep(t, 'enclosed');
        await waitViewer(t, 'exploded', '0');
        await waitViewer(t, 'ghost', 'shells');
        t.assert((await viewerAttr(t, 'glow')) === 'battery' && (await viewerAttr(t, 'hide')) === '', 'the battery glows, nothing hidden');
        await waitViewer(t, 'flying', 'false', { timeout: 10000 });
        await t.screenshot('2-enclosed');
      });
      await t.step('back at the question, "opened": the bottom cover hidden, the camera on the battery', async () => {
        await waitStatus(t, 'done', { timeout: 60000 });
        for (let i = 0; i < 6 && (await viewerAttr(t, 'tour-step')) !== 'ask'; i++) {
          const before = await viewerAttr(t, 'tour-step');
          await t.page.locator(tid('tour-back')).click();
          await t.waitFor(async () => (await viewerAttr(t, 'tour-step')) !== before, { timeout: 15000, message: 'Back to move' });
        }
        await waitStatus(t, 'choice');
        await t.page.locator(tid('tour-choice'), { hasText: 'Opened' }).click();
        await waitStep(t, 'opened');
        await waitViewer(t, 'hide', 'bottom-cover');
        t.assert((await viewerAttr(t, 'glow')) === 'battery' && (await viewerAttr(t, 'exploded')) === '0', 'assembled, the battery glowing');
        await waitViewer(t, 'flying', 'false', { timeout: 10000 });
        await t.screenshot('3-opened');
      });
      t.assert(leadCount(t) === lead, `the walkthrough sent nothing to the API (${leadCount(t) - lead} requests)`);
    },
  },
  {
    name: 'tour-local-object',
    title: 'Phone, Voice Mode, "walk me through it": the object tour — overview, taken apart, one step per group on its most important part, the end — each step said as it is shown; the bar keeps the count and the buttons, the step\'s words are the caption; free',
    device: 'iphone13',
    timeout: 240000,
    async run(t) {
      await voiceLaptop(t, { queue: ['Walk me through it.'], speech: { cps: 60 } });
      const lead = await t.waitFor(async () => (leadCount(t) >= 2 ? leadCount(t) : null), { timeout: 30000, message: 'the hologram reply' });
      await t.step('every step in order, each said', async () => {
        await waitStep(t, 'g-power', { timeout: 60000 });
        const caption = t.page.locator(tid('hologram-caption'));
        await t.waitFor(async () => /Power: the battery\./.test(norm(await t.text(caption))), { timeout: 10000, message: async () => `the step's words in the caption (${norm(await t.text(caption))})` });
        t.assert((await caption.getAttribute('data-state')) === 'tour', 'a tour caption');
        t.assert(!(await t.page.locator(tid('hologram-caption-open')).isVisible()), 'no "Open in chat" on a step\'s words');
        t.assert(!(await t.page.locator(tid('tour-words')).isVisible()), 'the bar has no words on a phone');
        t.assert(/^\d+ of 9$/.test(norm(await t.text(t.page.locator(tid('tour-count'))))), 'the count');
        await t.screenshot('1-phone-step');
        await waitStatus(t, 'done', { timeout: 90000 });
        const order = stepsOf(await tourLog(t));
        const want = ['overview', 'apart', 'g-case', 'g-display', 'g-power', 'g-board', 'g-cooling', 'g-input', 'end'];
        t.assert(JSON.stringify(order) === JSON.stringify(want), `the steps (${order.join(' → ')})`);
        const said = norm((await voice(t)).said.join(' | '));
        for (const words of ["Here's the 14-inch laptop, assembled.", 'Taken apart, it has 16 main parts.', 'Power: the battery.', "That's the tour."]) t.assert(said.includes(words), `"${words}" said (${said.slice(0, 300)}…)`);
        t.assert((await viewerAttr(t, 'exploded')) === '0', 'together again at the end');
      });
      t.assert(leadCount(t) === lead, 'free: nothing sent to the API');
      t.assertAppendOnly();
    },
  },
  {
    name: 'tour-words',
    title: 'Laptop, Voice Mode, the tour\'s words by the fake microphone — "repeat" (the question again), "back", "wait", "continue" (the default view), "previous", "say that again", "skip to the fan" (no step: the camera on it, paused), "continue", "that\'s enough" — each acts at once with no request to the mock; with the tour ended, "back" turns the model to its back view again',
    device: 'desktop',
    timeout: 300000,
    async run(t) {
      // v8.1 (changed on purpose, REGRESS-3): "back" says the step before and waits there (B5), so "wait" there
      // pauses the tour and "continue" goes on from that step to the question; the second "continue" takes the
      // default view. Before, "back" played on to the question, where "wait" said "I'll wait.".
      await voiceLaptop(t, { queue: ['Walk me through the battery.', 'Repeat.', 'Back.', 'Wait.', 'Continue.', 'Continue.'], speech: { cps: 60 } });
      const lead = await t.waitFor(async () => (leadCount(t) >= 2 ? leadCount(t) : null), { timeout: 30000, message: 'the hologram reply' });
      await t.step('"repeat" at the question asks it again; "back" says the step before and waits; "wait" there pauses; "continue" goes on', async () => {
        await t.waitFor(async () => norm((await voice(t)).said.join('|')).split(QUESTION).length - 1 >= 3, { timeout: 60000, message: async () => `the question asked three times: first, after "repeat", after "continue" (said: ${norm((await voice(t)).said.join(' | '))})` });
        const said = (await voice(t)).said.map(norm);
        const paused = said.findIndex((x) => /^Paused\. Say continue when you[’']re ready\.$/.test(x));
        t.assert(paused > 0, `"wait" on the step gone back to pauses there (${said.join(' | ')})`);
        t.assert(said[paused - 1] === PART_STEPS.apart, `"back" said the step before, then waited for the owner (${said.join(' | ')})`);
        const order = stepsOf(await tourLog(t));
        t.assert(order.filter((s) => s === 'apart').length >= 2, `"back" said "apart" again (${order.join(' → ')})`);
      });
      await t.step('"continue" takes the default view (enclosed); "previous" and "say that again" step and repeat', async () => {
        await waitStep(t, 'enclosed', { timeout: 30000 });
        await waitStatus(t, 'done', { timeout: 60000 });
        await sayNow(t, 'Previous.');
        await t.waitFor(async () => stepsOf(await tourLog(t)).slice(-2).join() === 'end,neighbours' || (await viewerAttr(t, 'tour-step')) === 'neighbours', { timeout: 30000, message: async () => `"previous" back to the neighbours (${stepsOf(await tourLog(t)).join(' → ')})` });
        // v8.1 (changed on purpose, REGRESS-3): "back" says that step and waits there (B5), so a second "back"
        // goes one step further; before, it played on to the end and the next "back" landed on the same step.
        await waitStatus(t, 'waiting', { timeout: 60000 });
        t.assert((await viewerAttr(t, 'tour-step')) === 'neighbours', 'it waits on the step it went back to');
        const said = (await voice(t)).said.length;
        await sayNow(t, 'Say that again.');
        await t.waitFor(async () => (await voice(t)).said.slice(said).some((x) => /^Next to it:/.test(norm(x))), { timeout: 30000, message: 'that step said again' });
        // ROUTING-R2-9: "say that again" there says that step and waits there again (it doesn't play on to the end).
        await waitStatus(t, 'waiting', { timeout: 30000 });
        t.assert((await viewerAttr(t, 'tour-step')) === 'neighbours', 'it waits on the same step again');
        t.assert(!(await voice(t)).said.slice(said).some((x) => /^That's the battery\./.test(norm(x))), 'the end step is not said');
        await sayNow(t, 'Next.');
        await t.waitFor(async () => (await voice(t)).said.slice(said).some((x) => /^That's the battery\./.test(norm(x))), { timeout: 30000, message: '"next" goes on to the end' });
      });
      await t.step('"skip to the fan": the battery\'s tour has no fan step, so the camera goes to it, paused, and Jarvis says how to go on', async () => {
        await waitStatus(t, 'done', { timeout: 60000 });
        await sayNow(t, 'Skip to the fan.');
        await waitStatus(t, 'paused', { timeout: 30000 });
        await waitViewer(t, 'glow', 'fan');
        await t.waitFor(async () => (await voice(t)).said.some((x) => /Say continue to go back to the tour\./.test(x)), { timeout: 15000, message: 'how to go back' });
        await sayNow(t, 'Continue.');
        await waitStatus(t, 'playing', { timeout: 30000 });
      });
      await t.step('"that\'s enough" ends the tour; then "back" turns the model to its back view, as before', async () => {
        await waitStatus(t, 'done', { timeout: 60000 });
        await sayNow(t, "That's enough.");
        await t.page.waitForFunction(() => !document.querySelector('[data-testid="hologram-viewer"]').dataset.tour, null, { timeout: 30000 });
        t.assert((await t.count('tour-bar')) === 0, 'the bar is gone');
        t.assert((await viewerAttr(t, 'glow')) === '', 'nothing glows any more');
        await t.waitFor(async () => (await voice(t)).said.some((x) => /that[’']s the end of the tour/.test(x)), { timeout: 15000, message: 'the line for the end' });
        await sayNow(t, 'Back.');
        await waitViewer(t, 'view', 'back', { timeout: 30000 });
      });
      t.assert(leadCount(t) === lead, `no request to the mock for any tour word (${leadCount(t) - lead})`);
    },
  },
  {
    name: 'tour-bar-keys',
    title: 'Desktop, no Voice Mode: "walk me through the battery" typed in the viewer starts the tour (the words move on by estimate); → next, ← back, Space pauses and plays, a touch on the model pauses, the bar\'s choice button, Next and End; Esc ends the tour first and closes the viewer on the second press; the bar\'s height never changes',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await chatLaptop(t);
      const lead = leadCount(t);
      const heights = new Set();
      const noteHeight = async () => {
        const b = await barBox(t);
        if (b) heights.add(b.height);
      };
      await t.step('typed: the tour starts at once, the bar in place of the tools', async () => {
        await typeCommand(t, 'walk me through the battery');
        await t.visible('tour-bar');
        await waitStep(t, 'overview', { timeout: 15000 });
        t.assert(!(await t.page.locator('.hv__tools').isVisible()), 'the tools make room for the bar');
        t.assert(/^1 of \d+$/.test(norm(await t.text(t.page.locator(tid('tour-count'))))), 'the count');
        await noteHeight();
        await t.screenshot('1-bar');
      });
      await t.step('→ and ←', async () => {
        await t.page.evaluate(() => document.activeElement && document.activeElement.blur()); // out of the command field
        await t.page.keyboard.press('ArrowRight');
        await waitStep(t, 'apart', { timeout: 5000 });
        await noteHeight();
        await t.page.keyboard.press('ArrowLeft');
        await waitStep(t, 'overview', { timeout: 5000 });
      });
      await t.step('Space pauses and plays; a touch on the model pauses', async () => {
        await waitStatus(t, 'playing');
        await t.page.keyboard.press('Space');
        await waitStatus(t, 'paused', { timeout: 5000 });
        t.assert((await t.count('hologram-viewer')) === 1, 'Space never pressed Close');
        await t.page.keyboard.press('Space');
        await waitStatus(t, 'playing', { timeout: 5000 });
        const stage = await t.page.locator(tid('hologram-stage')).boundingBox();
        await t.page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.45);
        await t.page.mouse.down();
        await t.page.mouse.move(stage.x + stage.width * 0.55, stage.y + stage.height * 0.45, { steps: 4 });
        await t.page.mouse.up();
        await waitStatus(t, 'paused', { timeout: 5000 });
        await t.page.locator(tid('tour-toggle')).click();
        await waitStatus(t, 'playing', { timeout: 5000 });
      });
      await t.step('the decision: a choice button; Next; End', async () => {
        await waitStatus(t, 'choice', { timeout: 30000 });
        await noteHeight();
        await t.screenshot('2-decision');
        await t.page.locator(tid('tour-choice'), { hasText: 'Enclosed' }).click();
        await waitStep(t, 'enclosed', { timeout: 10000 });
        await noteHeight();
        await t.page.locator(tid('tour-next')).click();
        await waitStep(t, 'info', { timeout: 10000 });
        await t.page.locator(tid('tour-end')).click();
        await t.page.waitForFunction(() => !document.querySelector('[data-testid="hologram-viewer"]').dataset.tour, null, { timeout: 5000 });
        t.assert(await t.page.locator('.hv__tools').isVisible(), 'the tools are back');
      });
      await t.step('Esc ends the tour first, then closes the viewer', async () => {
        await typeCommand(t, 'walk me through it');
        await waitStep(t, 'overview', { timeout: 15000 });
        await t.page.locator(tid('tour-toggle')).focus();
        await t.page.keyboard.press('Escape');
        await t.page.waitForFunction(() => !document.querySelector('[data-testid="hologram-viewer"]').dataset.tour, null, { timeout: 5000 });
        t.assert((await t.count('hologram-viewer')) === 1, 'the first Esc only ended the tour');
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
      });
      t.assert(heights.size === 1, `the bar's height never changed (${[...heights].join(', ')} px)`);
      t.assert(leadCount(t) === lead, 'free: nothing sent');
    },
  },
  {
    name: 'tour-enclosed-view',
    title: 'Desktop: "enclosed" — the laptop back together, its case see-through, the battery glowing orange where it sits (a screenshot to look at); "opened" — the bottom cover hidden and the camera on the battery from below',
    device: 'desktop',
    timeout: 180000,
    async run(t) {
      await chatLaptop(t);
      await typeCommand(t, 'walk me through the battery');
      await waitStatus(t, 'choice', { timeout: 45000 });
      await t.step('enclosed', async () => {
        await t.page.locator(tid('tour-choice'), { hasText: 'Enclosed' }).click();
        await waitStep(t, 'enclosed', { timeout: 10000 });
        await waitViewer(t, 'ghost', 'shells');
        await waitViewer(t, 'exploded', '0');
        await waitViewer(t, 'flying', 'false', { timeout: 10000 });
        await t.page.waitForTimeout(400); // the fades settle
        await t.page.locator(tid('tour-toggle')).click(); // hold the view for the picture
        const anchor = await batteryAnchor(t);
        t.assert(anchor, 'only the battery is labeled, and its label is shown');
        const bar = await barBox(t);
        // the model's area: under the title, above the bar; the battery's label left out
        const shot = await brightLight(await t.page.screenshot(), { top: 140, bottom: bar.top - 8, skip: [anchor.label] });
        const off = shot.centre ? Math.round(Math.hypot(shot.centre.x - anchor.x, shot.centre.y - anchor.y)) : -1;
        t.assert(shot.bright > 300 && off >= 0 && off < 140, `the brightest light is the battery (${shot.bright} bright pixels centred ${off} px from the battery)`);
        t.note(`enclosed: ${shot.bright} bright pixels, centred ${off} px from the battery`);
        await t.screenshot('1-enclosed');
      });
      await t.step('opened', async () => {
        await t.page.locator(tid('tour-toggle')).click();
        await t.page.locator(tid('tour-back')).click(); // back to the question
        await waitStatus(t, 'choice', { timeout: 15000 });
        await t.page.locator(tid('tour-choice'), { hasText: 'Opened' }).click();
        await waitStep(t, 'opened', { timeout: 10000 });
        await waitViewer(t, 'hide', 'bottom-cover');
        await waitViewer(t, 'flying', 'false', { timeout: 10000 });
        await t.page.waitForTimeout(400);
        await t.page.locator(tid('tour-toggle')).click();
        await t.screenshot('2-opened');
      });
    },
  },
  {
    name: 'tour-hidden',
    title: 'Voice Mode, a tour playing: the page hidden (the hologram stops drawing) pauses it and lets go of Voice Mode\'s hold; shown again, it goes on from its step and holds again',
    device: 'desktop',
    timeout: 180000,
    async run(t) {
      await voiceLaptop(t, { queue: ['Walk me through it.'], speech: { cps: 12 } });
      await waitStatus(t, 'playing', { timeout: 30000 });
      await waitViewer(t, 'tour-hold', 'on');
      const step = await viewerAttr(t, 'tour-step');
      const setHidden = (hidden) =>
        t.page.evaluate((h) => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
          document.dispatchEvent(new Event('visibilitychange'));
        }, hidden);
      await t.step('hidden: paused, the hold let go, the voice stopped', async () => {
        const cancels = (await voice(t)).cancels;
        await setHidden(true);
        await waitStatus(t, 'paused', { timeout: 5000 });
        await waitViewer(t, 'tour-hold', 'off', { timeout: 5000 });
        t.assert((await voice(t)).cancels > cancels, 'the narration was cut');
      });
      await t.step('shown: it goes on from its step, held again', async () => {
        await setHidden(false);
        await waitStatus(t, 'playing', { timeout: 5000 });
        await waitViewer(t, 'tour-hold', 'on', { timeout: 5000 });
        const log = await tourLog(t);
        const resumed = log.filter((e) => e.tourStatus === 'playing').pop();
        t.assert(resumed && (resumed.tourStep === step || stepsOf(log).indexOf(resumed.tourStep) >= stepsOf(log).indexOf(step)), `from its step (${step} → ${resumed && resumed.tourStep})`);
      });
    },
  },
  {
    name: 'tour-george-sync',
    title: 'Mac, George from a fake home base: "walk me through it" — each step is shown within 300 ms of its words starting to play (the chunk start), never when the speech is asked for',
    device: 'mac',
    seed: { settings: { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'auto' } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 240000,
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(recordGeorgeAudio);
      await voiceLaptop(t, { page, queue: ['Walk me through it.'] });
      await waitStatus(t, 'done', { timeout: 120000 });
      const log = await tourLog(t);
      const audio = georgeStarts(await page.evaluate(() => JSON.parse(JSON.stringify(window.__george))));
      const speaks = t.core.senses.speaks.map((s) => norm(s.text));
      t.assert(audio.length === speaks.length, `one piece of audio per sentence George was asked for (${audio.length} pieces, ${speaks.length} sentences)`);
      const first = speaks.findIndex((s) => s.startsWith("Here's the 14-inch laptop, assembled"));
      t.assert(first >= 0, `George said the tour (${speaks.join(' | ')})`);
      const steps = [
        ['overview', "Here's the 14-inch laptop, assembled"],
        ['apart', 'Taken apart, it has 16 main parts'],
        ['g-case', 'Case: the bottom cover'],
        ['g-power', 'Power: the battery'],
        ['g-input', 'Keyboard and touchpad: the keyboard'],
        ['end', "That's the tour"],
      ];
      // When the tour's narration was asked for (its run started): George's 4 s fallback counts from there.
      const asked = (log.find((e) => e.tourStatus === 'playing') || { at: -1 }).at;
      t.assert(asked > 0, 'the tour played');
      const gaps = [];
      const late = [];
      for (const [step, words] of steps) {
        const i = speaks.findIndex((s, k) => k >= first && s.startsWith(words));
        t.assert(i >= 0, `George said "${words}"`);
        if (i < 0) continue;
        const heard = audio[i].at;
        const shown = shownAt(log, step);
        t.assert(heard > 0, `${step}: George's audio for it played`);
        t.assert(shown > 0, `${step} was shown`);
        // M5: with no chunk 4 s after it was asked for (a home base slow under load), the first step is
        // shown then and the next ones follow George's chunks again.
        const fallback = step === 'overview' && heard - asked > 3900;
        const due = fallback ? asked + 4000 : heard;
        gaps.push(`${step} ${Math.round(shown - heard)} ms${fallback ? ` (George began ${Math.round(heard - asked)} ms after it was asked: shown ${Math.round(shown - asked)} ms after, by the fallback)` : ''}`);
        if (Math.abs(shown - due) > 300) late.push(`${step}: shown ${Math.round(shown - due)} ms from ${fallback ? 'the fallback' : 'its words'}`);
      }
      t.note(gaps.join(', '));
      t.assert(!late.length, `each step shown within 300 ms of its words (${late.join('; ')}; every step: ${gaps.join(', ')})`);
    },
  },
  {
    name: 'tour-device-voice',
    title: 'The device\'s own voice: with start events each step is shown as its words begin (never before them, and while its first sentence is still being said); without them (the engine assumes a chunk plays after 3 s) a step is never shown before its words and is shown within about 3.5 s of them; each step once',
    device: 'desktop',
    timeout: 300000,
    async run(t) {
      const check = async (page, { label, early, late, during = false }) => {
        await waitStatus(t, 'done', { timeout: 120000, page });
        const log = await tourLog(t, page);
        const v = await voice(t, page);
        const order = stepsOf(log);
        t.assert(new Set(order).size === order.length, `${label}: each step once (${order.join(' → ')})`);
        const gaps = [];
        const bad = [];
        for (const step of ['apart', 'g-case', 'g-power', 'g-input', 'end']) {
          const words = { apart: 'Taken apart, it has 16 main parts.', 'g-case': 'Case: the bottom cover.', 'g-power': 'Power: the battery.', 'g-input': 'Keyboard and touchpad: the keyboard.', end: "That's the tour." }[step];
          const k = v.log.findIndex((e) => norm(e.text).startsWith(words));
          const u = v.log[k];
          const shown = shownAt(log, step);
          t.assert(u && shown > 0, `${label}: ${step} said and shown`);
          if (!u || shown < 0) continue;
          const gap = Math.round(shown - u.at);
          gaps.push(`${step} ${gap}`);
          if (gap < early) bad.push(`${step} shown ${-gap} ms before its words`);
          if (gap > late) bad.push(`${step} shown ${gap} ms after its words began (at most ${late})`);
          // with start events: while its first sentence is still being said (the next one starts when it ends)
          const after = v.log[k + 1];
          if (during && after && shown > after.at) bad.push(`${step} shown ${Math.round(shown - after.at)} ms after its first sentence ended`);
        }
        t.note(`${label}: ${gaps.join(', ')} ms`);
        t.assert(!bad.length, `${label}: ${bad.join('; ')} (every step: ${gaps.join(', ')} ms)`);
      };
      await t.step('with start events', async () => {
        await voiceLaptop(t, { queue: ['Walk me through it.'], speech: { cps: 40 } });
        // The fake's start event is a page timer, which a loaded machine delays (100-540 ms here with other
        // browser runs beside this one). So the look must come while its first sentence is still being said
        // (the next sentence's start is that sentence's end timer, which a loaded page delays as much): a sync
        // bug shows it early (at speak()) or late (the 1.5 s fallback, an estimate, a sentence behind).
        await check(t.page, { label: 'start events', early: -60, late: 1500, during: true });
      });
      await t.step('without start events', async () => {
        const page = await t.newPage();
        t.page = page;
        await voiceLaptop(t, { page, queue: ['Walk me through it.'], speech: { cps: 20, quirks: { noStart: true } } });
        await check(page, { label: 'no start events', early: -60, late: 3600 });
      });
    },
  },
  {
    name: 'tour-decision-voice',
    title: 'Voice Mode at the question: "what does that do?" is one paid turn, answered about the glowing battery (the turn context says what is on screen), and the tour still waits at its decision; Voice Mode keeps listening after silent listens; then "enclosed" by voice goes on, free',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await voiceLaptop(t, { queue: ['Walk me through the battery.', 'What does that do?'] });
      const lead = await t.waitFor(async () => (leadCount(t) >= 2 ? leadCount(t) : null), { timeout: 30000, message: 'the hologram reply' });
      await waitStatus(t, 'choice', { timeout: 45000 });
      await t.step('"what does that do?" at the decision: one paid turn about the battery', async () => {
        const req = await t.waitFor(() => t.requests('lead').slice(lead).find((r) => /What does that do\?/.test(newestUserText(r.body))), { timeout: 30000, message: 'the question sent' });
        const ctx = newestTurnContext(req.body);
        t.assert(/On screen: the hologram "14-inch laptop", exploded; glowing: "Battery \(57 Wh\)" \(id: battery\)\. Walkthrough: step 3 of 7, the battery, apart\./.test(ctx), `the turn context says what is on screen (${(/^On screen:.*$/m.exec(ctx) || [''])[0]})`);
        // the device voice says a reply sentence by sentence
        await t.waitFor(async () => /That's the battery\. It stores the energy/.test(norm((await voice(t)).said.join(' '))), { timeout: 30000, message: async () => `the answer about the battery (said: ${norm((await voice(t)).said.join(' | ')).slice(-400)})` });
        t.assert(leadCount(t) === lead + 1, `exactly one request (${leadCount(t) - lead})`);
        t.assert((await viewerAttr(t, 'tour-status')) === 'choice', 'the tour still waits at its decision');
      });
      await t.step('the decision keeps listening, then "enclosed" by voice', async () => {
        const listens = (await voice(t)).listens;
        await t.waitFor(async () => (await voice(t)).listens >= listens + 3, { timeout: 30000, message: async () => `Voice Mode to listen again after silent listens (${(await voice(t)).listens - listens} more)` });
        t.assert((await viewerAttr(t, 'tour-status')) === 'choice', 'still at the decision');
        await sayNow(t, 'Enclosed.');
        await waitStep(t, 'enclosed', { timeout: 30000 });
        await waitViewer(t, 'ghost', 'shells');
        t.assert(leadCount(t) === lead + 1, '"enclosed" was free');
      });
    },
  },
  {
    name: 'tour-question-mid',
    title: 'Desktop, a tour playing: "what does that do?" typed in the viewer is exactly one request, and its turn context says what is on screen — the hologram, the glowing part and the walkthrough\'s step; the reply is captioned',
    device: 'desktop',
    timeout: 180000,
    async run(t) {
      await chatLaptop(t);
      await typeCommand(t, 'walk me through it');
      await waitStep(t, 'g-power', { timeout: 60000 });
      await t.page.locator(tid('tour-toggle')).click(); // hold the step while asking
      await waitStatus(t, 'paused', { timeout: 5000 });
      const lead = leadCount(t);
      await typeCommand(t, 'What does that do?');
      const req = await t.waitFor(() => t.requests('lead').slice(lead).find((r) => /What does that do\?/.test(newestUserText(r.body))), { timeout: 30000, message: 'the question sent' });
      const ctx = newestTurnContext(req.body);
      const line = (/^On screen:.*$/m.exec(ctx) || [''])[0];
      t.assert(/^On screen: the hologram "14-inch laptop", exploded; glowing: "Battery \(57 Wh\)" \(id: battery\)\. Walkthrough: step 5 of 9, the battery, apart\./.test(line), `the line (${line})`);
      const caption = t.page.locator(tid('hologram-caption'));
      await t.waitFor(async () => /Battery/.test(await t.text(caption)), { timeout: 30000, message: 'the answer captioned' });
      await t.page.waitForTimeout(800);
      t.assert(leadCount(t) === lead + 1, `exactly one request (${leadCount(t) - lead})`);
      t.assert((await viewerAttr(t, 'tour-step')) === 'g-power', 'the tour stays at its step');
      await t.screenshot('1-question-mid');
    },
  },
];

/**
 * tour-barge-in, a join with mac-hf (A8 + B5): not in the default list on this branch, because it needs v81-mac-hf's
 * barge-in (Voice Mode's bargeIn, Standby's capture kept through a woken session, the setup-1 gate). After merging
 * both, the integrator adds it to run.mjs (`...tours, tourBargeIn`). It follows mac-hf's own mac-barge-in setup.
 */
export const tourBargeIn = {
  name: 'tour-barge-in',
  title: 'Mac, setup 1 with the hands-free Test passed: woken by "Hey Jarvis", Jarvis walks through the laptop in George\'s voice; "Hey Jarvis" while he narrates stops him, the tour pauses at its step and he listens; "continue" goes on from that step',
  device: 'mac',
  fakeMusic: true, // the wake routine's Apple Music offer: no request leaves the test (as mac-hf's scenarios)
  fakeCore: { senses: { speak: 'ready' } },
  settings: { wakeWord: true, homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'owner', audioSetup: 'speaker-mac-mic' },
  timeout: 240000,
  async run(t) {
    const page = await t.newPage();
    await page.addInitScript(installFakeSpeech, { cps: 40 });
    await page.addInitScript(installFakeMic, { wakeLock: true });
    await page.addInitScript(recordTour);
    await page.addInitScript(() => {
      window.__voice.queue = [];
      try {
        // MAC-9: the result says what it measured (setup 1, the default devices here, claps and "Hey Jarvis").
        localStorage.setItem('jarvis.handsFreeTest.v1', JSON.stringify({ at: 1800000000000, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: true, measured: { setup: 'speaker-mac-mic', wakeMic: '', speaker: '', clap: true, word: true } }));
        localStorage.setItem('jarvis.dev.wakeWord', 'stub');
      } catch {
        /* storage unavailable */
      }
    });
    await t.goto('/', { page });
    await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
    await (await t.visible('quick-key-standby', { page })).click();
    await t.waitFor(async () => (await page.evaluate(() => document.querySelector('[data-testid="standby"]')?.dataset.word || '')) === 'ready', { timeout: 15000, message: 'the "Hey Jarvis" stand-in ready' });
    await page.evaluate((list) => window.__voice.queue.push(...list), ['', LAPTOP, 'Walk me through it.']);
    await page.evaluate(() => window.__jarvisWake.say());
    await page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
    await waitViewer(t, 'state', 'ready', { timeout: 60000, page });
    await waitStatus(t, 'playing', { timeout: 60000, page });
    await t.waitFor(() => t.core.senses.speaks.some((s) => /Taken apart, it has 16 main parts/.test(s.text)), { timeout: 60000, message: 'George narrating the tour' });
    await page.waitForTimeout(1600); // past the wake's own guard
    const step = await viewerAttr(t, 'tour-step', page);
    t.assert(await page.evaluate(() => window.__jarvisWake.say()), 'the stand-in heard "Hey Jarvis"');
    await waitStatus(t, 'paused', { timeout: 5000, page });
    await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'listening', { timeout: 5000, message: 'Jarvis listening' });
    t.assert((await viewerAttr(t, 'tour-step', page)) === step, `paused at its step (${step})`);
    await page.evaluate(() => window.__voice.queue.push('Continue.'));
    await waitStatus(t, 'playing', { timeout: 15000, page });
  },
};
