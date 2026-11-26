// Listening (v7.2, SPEC §9.2, §14.1): Jarvis decides when the owner has finished, not the browser, and
// shows what it heard for 2 seconds before sending it. The owner's report: "the microphone on Jarvis
// ends a little bit too early, and it's not the greatest at picking up the right sentence" (iPhone,
// Voice Mode, the Home Screen app, Safari's speech recognition). The fake recognizer behaves like
// iOS Safari here (features.mjs installFakeSpeech, recognizer 'ios'): one growing result per session,
// final only at its end, a session that ends by itself 0.7 s after the last words, and a restarted
// session that only hears what is said after it started. The last five scenarios cover what a review
// found: a late final that rewrites the turn that ended, words the recognizer takes back, a sentence
// said again after a pause, and spoken corrections that can only be guessed.

import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const voiceState = (t) => t.page.evaluate(() => JSON.parse(JSON.stringify({ ...window.__voice, say: undefined })));
const now = (t) => t.page.evaluate(() => performance.now());
const say = (t, item) => t.page.evaluate((x) => window.__voice.say(x), item);

/** The owner's words in every request Jarvis (the lead model) got: the newest user message's last text block. */
function sentTexts(t) {
  return t.requests('lead').map((r) => {
    const msgs = r.body?.messages || [];
    const user = [...msgs].reverse().find((m) => m.role === 'user');
    const blocks = Array.isArray(user?.content) ? user.content.filter((b) => b.type === 'text') : [];
    return norm(blocks.at(-1)?.text || '');
  });
}

/** Pretend the device's language is British English (navigator.language). */
function britishDevice() {
  try {
    Object.defineProperty(Navigator.prototype, 'language', { get: () => 'en-GB', configurable: true });
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => ['en-GB', 'en'], configurable: true });
  } catch {
    /* ignore */
  }
}

/** Voice Mode listens for a new request (not the 2-second check) on a recognizer started after `since`. */
async function listeningAgain(t, since) {
  await t.waitFor(
    async () => {
      const st = await t.page.evaluate(() => {
        const vm = document.querySelector('[data-testid="voice-mode"]');
        const review = document.querySelector('[data-testid="voice-review"]');
        return { state: vm && vm.getAttribute('data-state'), review: !!review && !review.hidden, sessions: window.__voice.sessions.length };
      });
      return st.state === 'listening' && !st.review && st.sessions > since;
    },
    { timeout: 30000, message: 'Voice Mode to listen again (Continuous)' },
  );
}

/** The 2-second check shows `words` (it appears once the owner has finished). */
async function checkShows(t, words, { timeout = 15000 } = {}) {
  const review = t.page.locator(tid('voice-review'));
  await t.waitFor(async () => (await review.isVisible()) && norm(await t.text(t.page.locator(tid('voice-review-text')))) === words, {
    timeout,
    message: async () => `the 2-second check to show "${words}" (it shows "${norm(await t.text(t.page.locator(tid('voice-review-text'))).catch(() => ''))}", visible ${await review.isVisible()})`,
  });
  return review;
}

/** Open Voice Mode and wait until it listens. */
async function openListening(t) {
  await (await t.visible('voice-open')).click();
  const vm = await t.visible('voice-mode');
  await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 8000, message: 'Voice Mode to listen' });
  return vm;
}

/** A tap on the core when Voice Mode is idle: it listens again. */
async function tapToListen(t) {
  await t.page.locator(tid('voice-core')).click();
  await t.waitFor(async () => (await t.page.locator(tid('voice-mode')).getAttribute('data-state')) === 'listening', { timeout: 8000, message: 'Voice Mode to listen again' });
}

/** Voice Mode said the words were dropped ("Okay, not sent."). */
async function notSent(t, what) {
  await t.waitFor(async () => /Okay, not sent\./.test(await t.text(t.page.locator(tid('voice-captions')))), {
    timeout: 8000,
    message: async () => `${what} to drop the words (captions "${norm(await t.text(t.page.locator(tid('voice-captions'))))}", sent ${JSON.stringify(sentTexts(t))})`,
  });
}

export default [
  {
    name: 'voice-listen-iphone',
    title:
      'iPhone Voice Mode with an iOS-style recognizer: a 1.2 s pause mid-sentence is not cut (the session that ends is restarted and the words appended once); the words show for 2 seconds with a countdown before they are sent; a trailing "and" waits; tap the words to fix them; "no, I said …" corrects them; "cancel" sends nothing; the device language is used',
    device: 'iphone13',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(britishDevice);
      await t.page.addInitScript(installFakeSpeech, { recognizer: 'ios', noSpeechMs: 8000 });
      await t.page.addInitScript(() => {
        // "What is the capital … (1.2 s) … of France?"
        window.__voice.queue = [{ parts: [{ at: 300, text: 'What is' }, { at: 650, text: 'the capital' }, { at: 1850, text: 'of France?' }] }];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      const vm = await t.visible('voice-mode');
      let shownAt = 0;

      await t.step('a 1.2 s pause in the middle of a sentence does not cut it', async () => {
        const review = await checkShows(t, 'What is the capital of France?');
        shownAt = await now(t);
        const v = await voiceState(t);
        t.assert(v.sessions.length >= 2, `iOS ended its session in the pause and listening started again at once (${v.sessions.length} sessions)`);
        const first = v.sessions[0];
        t.assert(first.continuous === true && first.interim === true && first.alternatives === 3, `A continuous recognizer with interim results and 3 alternatives (${JSON.stringify(first)})`);
        t.assert(v.sessions.every((s) => s.lang === 'en-GB'), `It listens in the device's language, en-GB (${v.sessions.map((s) => s.lang).join(', ')})`);
        t.assert(sentTexts(t).length === 0, 'Nothing is sent while the words are shown');
        t.assert((await review.getAttribute('data-state')) === 'counting', 'The countdown runs');
        t.assert((await vm.getAttribute('data-review')) === 'counting', 'Voice Mode says so (data-review)');
        t.assert(/Send now/.test(await t.text(t.page.locator(tid('voice-review-now')))), 'Send now is offered');
        await t.screenshot('1-check');
      });

      await t.step('after 2 seconds the words are sent as they were shown', async () => {
        const turn = t.page.locator(tid('turn-jarvis')).first();
        await t.waitFor(() => sentTexts(t).some((x) => x.includes('What is the capital of France?')), { timeout: 10000, message: 'the question to be sent' });
        const sentAt = await now(t);
        t.assert(sentAt - shownAt >= 1600, `It waited about 2 seconds (${Math.round(sentAt - shownAt)} ms)`);
        t.assert(!sentTexts(t).some((x) => /^What is the capital$/.test(x)), 'The first half of the sentence was never sent alone');
        await t.waitForTurn(turn, ['done']);
        await t.waitFor(async () => (await voiceState(t)).said.join(' ').includes('Paris'), { timeout: 15000, message: 'the answer to be spoken' });
      });

      await t.step('a sentence that stops on "and" waits for the rest', async () => {
        const before = (await voiceState(t)).sessions.length;
        await listeningAgain(t, before - 1);
        const t0 = await now(t);
        await say(t, { parts: [{ at: 200, text: 'Remind me to buy milk and' }, { at: 2300, text: 'eggs' }] });
        await checkShows(t, 'Remind me to buy milk and eggs');
        t.assert((await now(t)) - t0 >= 2300, 'The words after a 2.1 s pause were still taken (1.6 s + 1 s after "and")');
        await t.screenshot('2-and');
      });

      await t.step('tap the words to fix them: the countdown stops; Send sends the fixed words', async () => {
        await t.page.locator(tid('voice-review-text')).click();
        const input = await t.visible('voice-review-input', { message: 'A field to fix the words opens' });
        t.assert((await input.inputValue()) === 'Remind me to buy milk and eggs', 'It holds what was heard');
        t.assert((await t.page.locator(tid('voice-review')).getAttribute('data-state')) === 'editing', 'The check is being edited');
        const sent = sentTexts(t).length;
        await t.page.waitForTimeout(2600);
        t.assert(sentTexts(t).length === sent, 'Nothing was sent while fixing the words');
        await input.fill('Remind me to buy milk and bread');
        await t.screenshot('3-fix');
        await t.page.locator(tid('voice-review-send')).click();
        await t.waitFor(() => sentTexts(t).some((x) => x.includes('Remind me to buy milk and bread')), { timeout: 10000, message: 'the fixed words to be sent' });
        t.assert(!sentTexts(t).some((x) => x.includes('eggs')), 'The words as heard were not sent');
        const turn = t.page.locator(tid('turn-jarvis')).nth(1);
        await t.waitForTurn(turn, ['done']);
      });

      await t.step('"no, I said …" corrects the words and the countdown starts again', async () => {
        const before = (await voiceState(t)).sessions.length;
        await listeningAgain(t, before - 1);
        await say(t, 'What is the weather in Austin');
        await checkShows(t, 'What is the weather in Austin');
        await say(t, { parts: [{ at: 100, text: 'No, I said Boston' }] });
        await t.waitFor(async () => (await t.page.locator(tid('voice-review')).getAttribute('data-state')) === 'listening', { timeout: 5000, message: 'the countdown to wait while the owner talks' });
        await checkShows(t, 'What is the weather in Boston', { timeout: 10000 });
        await t.screenshot('4-corrected');
        await t.waitFor(() => sentTexts(t).some((x) => x.includes('What is the weather in Boston')), { timeout: 10000, message: 'the corrected words to be sent' });
        t.assert(!sentTexts(t).some((x) => /Austin|I said/.test(x)), 'Neither the misheard words nor the correction were sent');
        const turn = t.page.locator(tid('turn-jarvis')).nth(2);
        await t.waitForTurn(turn, ['done']);
      });

      await t.step('"cancel" while the words are shown: nothing is sent', async () => {
        const before = (await voiceState(t)).sessions.length;
        await listeningAgain(t, before - 1);
        const sent = sentTexts(t).length;
        await say(t, 'Tell me a joke about robots');
        await checkShows(t, 'Tell me a joke about robots');
        await say(t, { parts: [{ at: 100, text: 'Cancel.' }] });
        await t.waitFor(async () => !(await t.page.locator(tid('voice-review')).isVisible()), { timeout: 8000, message: 'the check to close' });
        await t.waitFor(async () => /Okay, not sent\./.test(await t.text(t.page.locator(tid('voice-captions')))), { timeout: 3000, message: 'Voice Mode to say it was not sent' });
        await t.page.waitForTimeout(2500);
        t.assert(sentTexts(t).length === sent, 'Nothing was sent');
        t.assert((await t.count('turn-jarvis')) === 3, 'No new reply');
        await t.screenshot('5-cancelled');
      });
    },
  },

  {
    name: 'voice-listen-settings',
    title:
      'Settings → Voice: Listening language (Automatic: the device language), Wait after I stop talking and After I stop talking; a tap on the core while listening sends at once; "Send right away" sends without the 2-second check',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 6000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      const settingsSelect = (key) => t.page.locator(tid(`setting-${key}`));

      await t.step('the Voice section offers the listening choices', async () => {
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        const lang = settingsSelect('listenLang');
        await lang.scrollIntoViewIfNeeded();
        t.assert((await lang.inputValue()) === '', 'Listening language: Automatic by default');
        const first = norm(await lang.locator('option').first().textContent());
        t.assert(first === 'Automatic — this device (English (US) · en-US)', `The first option names the device language ("${first}")`);
        const wait = settingsSelect('listenWait');
        t.assert((await wait.inputValue()) === 'normal', 'Wait after I stop talking: Normal');
        const waits = await wait.locator('option').allTextContents();
        t.assert(waits.join('|') === 'Short (1 second)|Normal (1.6 seconds)|Long (2.6 seconds)', `Short, Normal, Long (${waits.join(', ')})`);
        const send = settingsSelect('listenSend');
        t.assert((await send.inputValue()) === 'show', 'After I stop talking: show what I said for 2 seconds');
        const sends = await send.locator('option').allTextContents();
        t.assert(sends.join('|') === 'Show what I said for 2 seconds, then send|Send right away', `The two choices (${sends.join(', ')})`);
        await send.scrollIntoViewIfNeeded();
        await t.screenshot('1-settings');
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('settings-sheet')).waitFor({ state: 'hidden', timeout: 5000 });
      });

      await t.step('a tap on the core while listening sends at once (no 2-second check)', async () => {
        await (await t.visible('voice-open')).click();
        const vm = await t.visible('voice-mode');
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 5000, message: 'Voice Mode to listen' });
        await say(t, { parts: [{ at: 100, text: 'What is the capital of France' }] });
        await t.waitFor(async () => /capital of France/.test(await t.text(t.page.locator(tid('voice-captions')))), { timeout: 5000, message: 'the words to show while the owner talks' });
        await t.page.locator(tid('voice-core')).click();
        await t.waitFor(() => sentTexts(t).length > 0, { timeout: 5000, message: 'the words to be sent at once' });
        t.assert(sentTexts(t)[0].includes('What is the capital of France'), 'The words heard so far');
        t.assert(!(await t.page.locator(tid('voice-review')).isVisible()), 'No 2-second check after a tap');
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).first(), ['done']);
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
      });

      await t.step('"Send right away" (and Short): the words go out about a second after the owner has finished', async () => {
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        await settingsSelect('listenSend').scrollIntoViewIfNeeded();
        await settingsSelect('listenSend').selectOption('now');
        await settingsSelect('listenWait').selectOption('short');
        const stored = await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1')));
        t.assert(stored.listenSend === 'now' && stored.listenWait === 'short', `Saved (${stored.listenSend}, ${stored.listenWait})`);
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('settings-sheet')).waitFor({ state: 'hidden', timeout: 5000 });
        const sent = sentTexts(t).length;
        const listens = (await voiceState(t)).listenLog.length;
        await t.page.evaluate(() => window.__voice.queue.push('And what about Germany, what is its capital?'));
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        const listenAt = await t.waitFor(async () => (await voiceState(t)).listenLog[listens], { timeout: 5000, message: 'Voice Mode to listen' });
        await t.waitFor(() => sentTexts(t).length > sent, { timeout: 10000, message: 'the question to be sent' });
        const sentAt = await now(t);
        t.assert(!(await t.page.locator(tid('voice-review')).isVisible()), 'No 2-second check');
        t.assert(sentAt - listenAt < 2400, `Sent about 1 s after the words (heard at 0.5 s; sent at ${Math.round(sentAt - listenAt)} ms)`);
        t.assert(sentTexts(t).at(-1).includes('And what about Germany, what is its capital?'), 'The words heard');
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).nth(1), ['done']);
      });
    },
  },

  {
    name: 'voice-listen-alternatives',
    title:
      'Voice Mode uses the recognizer\'s other readings, for free commands only (v8.1, R7): camera words heard as "locking at" are never a camera request from another reading (the words wait in the 2-second check, and "cancel" sends nothing); with a hologram open, "the separate her" shows the separator (a part\'s name, free) and a question about it is sent with the part\'s name; Chrome\'s contextual biasing gets "Jarvis", the command words and the part names',
    device: 'iphone13',
    timeout: 200000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { phrases: true, noSpeechMs: 8000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      const vm = await t.visible('voice-mode');
      const viewerAttr = (name) => t.page.locator(tid('hologram-viewer')).getAttribute(`data-${name}`);

      await t.step('contextual biasing: the recognizer is given "Jarvis" and the command words', async () => {
        const v = await t.waitFor(async () => {
          const st = await voiceState(t);
          return st.sessions.length ? st : null;
        }, { timeout: 5000, message: 'Voice Mode to listen' });
        const phrases = v.sessions[0].phrases || [];
        t.assert(phrases[0] === 'Jarvis', `"Jarvis" first (${phrases.slice(0, 3).join(', ')})`);
        t.assert(['expand it', 'other screen', 'what am I looking at', 'cancel'].every((p) => phrases.includes(p)), 'The command words too');
      });

      // v8.1 (R7, critique L4): the camera is never asked for by a reading the recognizer was less sure
      // of, and no other reading counts when the best one is a question: the words wait in the check.
      await t.step('a reading the recognizer was less sure of is never a camera request: the words wait in the check; "cancel" sends nothing', async () => {
        await say(t, { parts: [{ at: 100, text: 'What am I locking at?', alts: ['What am I looking at?'] }] });
        await checkShows(t, 'What am I locking at?');
        t.assert(!(await voiceState(t)).said.some((x) => /Tap Look/.test(x)), 'Look is not asked for');
        await say(t, 'cancel');
        await notSent(t, '"cancel"');
        t.assert(sentTexts(t).length === 0, 'Nothing was sent to Jarvis');
      });

      await t.step('"show me an AA battery" builds the hologram over Voice Mode', async () => {
        await t.waitFor(async () => ['listening', 'idle'].includes(await vm.getAttribute('data-state')), { timeout: 15000, message: 'Voice Mode to be ready' });
        if ((await vm.getAttribute('data-state')) !== 'listening') await t.page.locator(tid('voice-core')).click();
        await say(t, { parts: [{ at: 100, text: '[[hologram:battery]] Show me an AA battery' }] });
        await t.visible('hologram-viewer', { timeout: 30000, message: 'The hologram viewer opens over Voice Mode' });
        await t.waitFor(async () => (await viewerAttr('state')) === 'ready', { timeout: 60000, message: 'the hologram to be built' });
        await t.waitFor(async () => /Say "expand it", or tap any part\./.test((await voiceState(t)).said.join(' ')), { timeout: 30000, message: 'Jarvis to say the hologram is up' });
      });

      await t.step('"the separate her": the reading with a part\'s name acts at once, free', async () => {
        const before = sentTexts(t).length;
        const sessions = (await voiceState(t)).sessions.length;
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening' && (await voiceState(t)).sessions.length > sessions - 1, { timeout: 15000, message: 'Voice Mode to listen again' });
        const v = await voiceState(t);
        const phrases = v.sessions.at(-1).phrases || [];
        t.assert(phrases.includes('Separator') || phrases.some((p) => /separator/i.test(p)), `The open hologram's part names are listened for (${phrases.slice(0, 12).join(', ')})`);
        await say(t, { parts: [{ at: 100, text: 'Show the separate her.', alts: ['Show the separator.'] }] });
        await t.waitFor(async () => (await viewerAttr('selected')) === 'separator', { timeout: 15000, message: 'the separator to be shown' });
        await t.waitFor(async () => (await voiceState(t)).said.some((x) => norm(x) === "Here's the separator."), { timeout: 15000, message: 'the acknowledgement' });
        t.assert(sentTexts(t).length === before, 'Nothing was sent to Jarvis');
      });

      await t.step('a question that mishears a part\'s name is sent with the name (after the 2-second check)', async () => {
        const before = sentTexts(t).length;
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 15000, message: 'Voice Mode to listen again' });
        await say(t, { parts: [{ at: 100, text: 'How does the separate her work?', alts: ['How does the separator work?'] }] });
        await checkShows(t, 'How does the separator work?');
        await t.waitFor(async () => /How does the separator work\?/.test(norm(await t.text(t.page.locator(tid('hologram-viewer'))))), { timeout: 5000, message: 'the viewer to show what was heard' });
        await t.screenshot('1-check-under-viewer');
        await t.waitFor(() => sentTexts(t).length > before, { timeout: 10000, message: 'the question to be sent' });
        t.assert(sentTexts(t).at(-1).includes('How does the separator work?'), `Sent with the part's name ("${sentTexts(t).at(-1)}")`);
      });
    },
  },

  {
    name: 'voice-listen-small',
    title: 'The 2-second check fits small screens: on a 320×568 phone and in landscape (844×390) the words, Send now and Cancel stay clear of the dock and the status line, with no sideways scroll, also while the words are being fixed',
    device: 'small',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 30000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = ['Remind me to call the dentist tomorrow morning and book a cleaning for next week'];
      });
      await t.page.setViewportSize({ width: 320, height: 568 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await checkShows(t, 'Remind me to call the dentist tomorrow morning and book a cleaning for next week');
      await t.page.locator(tid('voice-review-text')).click(); // fixing the words: nothing is sent meanwhile
      await t.visible('voice-review-input');
      await t.page.locator(tid('voice-review-input')).press('Escape'); // keep them, waiting
      await t.waitFor(async () => (await t.page.locator(tid('voice-review')).getAttribute('data-state')) === 'paused', { timeout: 3000, message: 'the check to wait' });
      const layout = () =>
        t.page.evaluate(() => {
          const box = (sel) => {
            const el = document.querySelector(sel);
            if (!el || el.hidden || !el.getClientRects().length) return null;
            const b = el.getBoundingClientRect();
            return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) };
          };
          return {
            status: box('.vm-status'),
            text: box('[data-testid="voice-review-text"]'),
            input: box('[data-testid="voice-review-input"]'),
            now: box('[data-testid="voice-review-now"]'),
            cancel: box('[data-testid="voice-review-cancel"]'),
            dock: box('.vm-dock'),
            vw: innerWidth,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        });
      for (const [w, h, editing] of [[320, 568, false], [844, 390, false], [844, 390, true], [320, 568, true]]) {
        await t.page.setViewportSize({ width: w, height: h });
        const state = await t.page.locator(tid('voice-review')).getAttribute('data-state');
        if (editing && state !== 'editing') await t.page.locator(tid('voice-review-text')).click();
        if (!editing && state === 'editing') await t.page.locator(tid('voice-review-input')).press('Escape');
        await t.page.waitForTimeout(400);
        const m = await layout();
        const words = editing ? m.input : m.text;
        const where = `${w}×${h}${editing ? ', fixing the words' : ''}: ${JSON.stringify(m)}`;
        t.assert(words && m.cancel && m.dock && m.status, `${where}: everything is there`);
        t.assert(!m.overflow && words.right <= m.vw && m.cancel.right <= m.vw, `${where}: no sideways scroll`);
        t.assert(words.top >= m.status.bottom, `${where}: the words are below the status line`);
        t.assert(m.cancel.bottom <= m.dock.top, `${where}: Cancel (and Send now) end above the dock`);
        if (m.now) t.assert(m.now.bottom <= m.dock.top, `${where}: Send now ends above the dock`);
        await t.screenshot(`${w}x${h}${editing ? '-fix' : ''}`);
      }
    },
  },

  {
    name: 'chat-mic-check',
    title: 'The chat\'s microphone: the words wait 2 seconds in the message box with a countdown, then go; a tap on the box stops that and keeps them',
    device: 'iphone13',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 6000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await t.visible('empty-state');

      await t.step('the words wait in the box with a countdown, then are sent', async () => {
        await t.page.evaluate(() => window.__voice.queue.push('What is the capital of France?'));
        await (await t.visible('composer-mic')).click();
        const box = t.page.locator(tid('composer-input'));
        await t.waitFor(async () => (await box.inputValue()) === 'What is the capital of France?', { timeout: 5000, message: 'the words in the message box' });
        const countdown = await t.visible('composer-countdown', { timeout: 5000, message: 'The countdown shows once the owner has finished' });
        const shownAt = await now(t);
        t.assert(/Sending in 2 seconds/.test(await t.text(countdown)), 'It says so');
        t.assert((await t.count('turn-user')) === 0, 'Not sent yet');
        await t.screenshot('1-countdown');
        await t.waitFor(async () => (await t.count('turn-user')) === 1, { timeout: 6000, message: 'the message to be sent after the countdown' });
        t.assert((await now(t)) - shownAt >= 1600, 'About 2 seconds later');
        t.assert(/capital of France/.test(await t.text(t.page.locator(tid('turn-user')).first())), 'The words heard were sent');
        t.assert(!(await countdown.isVisible()), 'The countdown is gone');
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).first(), ['done']);
      });

      await t.step('a tap on the box stops the countdown; the words stay to be changed and sent by hand', async () => {
        await t.page.evaluate(() => window.__voice.queue.push('And what about Germany'));
        await (await t.visible('composer-mic')).click();
        await t.visible('composer-countdown', { timeout: 6000, message: 'The countdown shows' });
        await t.page.locator(tid('composer-input')).click();
        await t.waitFor(async () => !(await t.page.locator(tid('composer-countdown')).isVisible()), { timeout: 2000, message: 'the countdown to stop' });
        await t.page.waitForTimeout(2500);
        t.assert((await t.count('turn-user')) === 1, 'Nothing more was sent');
        const box = t.page.locator(tid('composer-input'));
        t.assert((await box.inputValue()) === 'And what about Germany', 'The words are still in the box');
        await box.fill('And what about Germany, what is its capital?');
        await t.page.locator(tid('composer-send')).click();
        await t.waitFor(async () => (await t.count('turn-user')) === 2, { timeout: 5000, message: 'the fixed message to be sent' });
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).nth(1), ['done']);
      });
    },
  },

  // ---- the fixes after the review of the listening work (F1-F4) -----------------------------------

  {
    name: 'voice-listen-late-final',
    title:
      'Chrome, Short wait: the recognizer rewrites the sentence after the turn ended ("twenty five" → "25", the last word dropped) while the 2-second check listens: "cancel" and "never mind" said during the check are heard whole, and nothing is sent',
    device: 'mac',
    settings: { listenWait: 'short' },
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 8000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await openListening(t);
      const cases = [
        ['set a timer for twenty five minutes', 'set a timer for 25 minutes', 'cancel'],
        ["what's the weather like in Boston today", "what's the weather like in Boston", 'never mind'],
      ];
      for (const [i, [heard, rewritten, said]] of cases.entries()) {
        await t.step(`"${said}" after the late final "${rewritten}"`, async () => {
          if (i > 0) await tapToListen(t);
          // The turn ends 1 s after the words (Short); Chrome's final rewrites them 0.15 s later, and
          // the owner speaks 0.4 s into the check.
          await say(t, { parts: [{ at: 100, text: heard }, { at: 1250, revise: rewritten }, { at: 1500, text: said }] });
          await notSent(t, `"${said}"`);
          await t.page.waitForTimeout(2500);
          t.assert(sentTexts(t).length === 0, `Nothing was sent (${JSON.stringify(sentTexts(t))})`);
        });
      }
      t.assert((await t.count('turn-jarvis')) === 0, 'No reply');
    },
  },

  {
    name: 'voice-listen-check-noise',
    title: 'A noise the recognizer first hears as "uh" and then takes back during the 2-second check: the countdown goes on and the question is sent as it was',
    device: 'mac',
    timeout: 60000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 8000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await openListening(t);
      // The check starts 1.6 s after the words; "uh" comes 0.4 s into it and is taken back 0.15 s later.
      await say(t, { parts: [{ at: 100, text: 'What is the capital of France' }, { at: 2100, text: 'uh' }, { at: 2250, revise: '' }] });
      await checkShows(t, 'What is the capital of France');
      await t.waitFor(() => sentTexts(t).length > 0, {
        timeout: 9000,
        message: async () => `the question to be sent (the check is "${await t.page.locator(tid('voice-review')).getAttribute('data-state').catch(() => '')}", status "${norm(await t.text(t.page.locator(tid('voice-status'))))}")`,
      });
      t.assert(sentTexts(t)[0] === 'What is the capital of France', `Sent as it was (${JSON.stringify(sentTexts(t))})`);
      await t.waitForTurn(t.page.locator(tid('turn-jarvis')).first(), ['done']);
    },
  },

  {
    name: 'voice-listen-noise-now',
    title: 'Send right away: a noise heard as "uh" and taken back is never sent; Jarvis keeps listening and sends the question said after it',
    device: 'mac',
    settings: { listenSend: 'now' },
    timeout: 60000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 8000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await openListening(t);
      await say(t, { parts: [{ at: 100, text: 'uh' }, { at: 250, revise: '' }, { at: 4000, text: 'What time is it' }] });
      await t.waitFor(() => sentTexts(t).length > 0, { timeout: 12000, message: 'the question to be sent' });
      t.assert(sentTexts(t)[0] === 'What time is it', `Only the question was sent, never "uh" (${JSON.stringify(sentTexts(t))})`);
      await t.waitForTurn(t.page.locator(tid('turn-jarvis')).first(), ['done']);
    },
  },

  {
    name: 'voice-listen-restate',
    title: 'iPhone, Send right away: the owner pauses (iOS ends its session), then says the sentence again from the top with more: it is not cut while they say it',
    device: 'iphone13',
    settings: { listenSend: 'now' },
    timeout: 60000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { recognizer: 'ios', noSpeechMs: 8000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await openListening(t);
      await say(t, { parts: [{ at: 100, text: 'Set an alarm for seven' }, { at: 1150, text: 'Set an' }, { at: 1450, text: 'alarm for' }, { at: 1750, text: 'seven' }, { at: 2050, text: 'thirty' }] });
      await t.waitFor(() => sentTexts(t).length > 0, { timeout: 10000, message: 'the question to be sent' });
      t.assert(sentTexts(t)[0] === 'Set an alarm for seven thirty', `Sent whole, once (${JSON.stringify(sentTexts(t))})`);
      const v = await voiceState(t);
      t.assert(v.sessions.length >= 2, `iOS ended its session in the pause and listening started again (${v.sessions.length} sessions)`);
      await t.waitForTurn(t.page.locator(tid('turn-jarvis')).first(), ['done']);
    },
  },

  {
    name: 'voice-listen-corrections',
    title:
      'iPhone, during the 2-second check: "No no, cancel" sends nothing; "No, I said Paris" (nothing sounds like it) shows the guess "What\'s the weather in Paris" and waits for "yes"; "No, I said for four" changes only "for two" and counts down again',
    device: 'iphone13',
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { recognizer: 'ios', noSpeechMs: 8000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await openListening(t);
      const review = t.page.locator(tid('voice-review'));

      await t.step('"No no, cancel": nothing is sent', async () => {
        await say(t, 'Tell me a joke about robots');
        await checkShows(t, 'Tell me a joke about robots');
        await say(t, { parts: [{ at: 100, text: 'No no, cancel' }] });
        await notSent(t, '"No no, cancel"');
        await t.page.waitForTimeout(2500);
        t.assert(sentTexts(t).length === 0, `Nothing was sent (${JSON.stringify(sentTexts(t))})`);
      });

      await t.step('"No, I said Paris": a guess, shown until the owner says "yes"', async () => {
        await tapToListen(t);
        await say(t, "What's the weather in Austin");
        await checkShows(t, "What's the weather in Austin");
        await say(t, { parts: [{ at: 100, text: 'No, I said Paris' }] });
        await checkShows(t, "What's the weather in Paris", { timeout: 10000 });
        await t.waitFor(async () => (await review.getAttribute('data-state')) === 'paused', { timeout: 3000, message: 'the check to wait for the owner' });
        t.assert(/Is that right\?/.test(await t.text(t.page.locator(tid('voice-status')))), 'Jarvis asks whether that is right');
        t.assert(/No, I said Paris/.test(await t.text(t.page.locator(tid('voice-review-heard')))), 'What the owner said is shown');
        t.assert(/Say “yes”/.test(await t.text(t.page.locator(tid('voice-review-hint')))), 'The hint says how to confirm');
        await t.screenshot('1-guess');
        await t.page.waitForTimeout(3000);
        t.assert(sentTexts(t).length === 0, `Nothing is sent while Jarvis is only guessing (${JSON.stringify(sentTexts(t))})`);
        await say(t, { parts: [{ at: 100, text: 'Yes.' }] });
        await t.waitFor(() => sentTexts(t).length > 0, { timeout: 8000, message: '"yes" to send it' });
        t.assert(sentTexts(t)[0] === "What's the weather in Paris", `The guess was sent (${JSON.stringify(sentTexts(t))})`);
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).first(), ['done']);
      });

      await t.step('"No, I said for four": only "for two" changes; the countdown starts again', async () => {
        const before = (await voiceState(t)).sessions.length;
        await listeningAgain(t, before - 1);
        await say(t, 'Book a table for two at seven');
        await checkShows(t, 'Book a table for two at seven');
        await say(t, { parts: [{ at: 100, text: 'No, I said for four' }] });
        await checkShows(t, 'Book a table for four at seven', { timeout: 10000 });
        await t.waitFor(() => sentTexts(t).length > 1, { timeout: 10000, message: 'the corrected words to be sent' });
        t.assert(sentTexts(t)[1] === 'Book a table for four at seven', `Sent corrected (${JSON.stringify(sentTexts(t))})`);
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).nth(1), ['done']);
      });
    },
  },
];
