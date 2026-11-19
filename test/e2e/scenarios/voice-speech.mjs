// The voice upgrade (SPEC §9.2, §14.1, §16): the chat's Speak button reads the whole answer, even
// on a speech engine with quirks; Voice Mode turns use the spoken reply channel, are spoken while
// they stream (the part above ---, the preamble while a search runs) and listen again afterwards;
// Settings → Voice: Speak replies labels, the ranked voice picker and the natural-voice tip.

import { tid } from '../harness.mjs';
import { turnContextOf } from '../../mock/content.mjs';
import { installFakeSpeech } from './features.mjs';
import { toSpeech, rankVoices } from '../../../src/platform/voice/tts.js';
import { markdownToPlainText } from '../../../src/lib/markdown.js';
import { finalAnswerMarkdown } from '../../../src/ui/voice-mode.js';
import { cutAtBreak } from '../../../src/ui/voice-stream.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const NEVER_SPOKEN = /Details|Louvre|Next step|\*\*|\]\(http/;

/** Pretend to be the installed iOS app (navigator.standalone). */
function emulateStandalone() {
  try {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
  } catch {
    /* ignore */
  }
}

async function waitForNewTurn(t, before) {
  await t.waitFor(async () => (await t.count('turn-jarvis')) > before, { timeout: 15000, message: 'a new Jarvis turn' });
  return t.page.locator(tid('turn-jarvis')).nth(before);
}

const voiceState = (t) => t.page.evaluate(() => JSON.parse(JSON.stringify(window.__voice)));

/** The <turn_context> of the newest owner message in the latest lead request. */
function lastTurnContext(t) {
  const messages = t.requests('lead').at(-1)?.body?.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const ctx = turnContextOf(messages[i]);
    if (messages[i].role === 'user' && ctx.present) {
      const raw = messages[i].content.find((b) => b.type === 'text' && /<turn_context>/.test(b.text))?.text || '';
      return { ...ctx, raw };
    }
  }
  return { present: false, spoken: false, raw: '' };
}

/** The newest Jarvis turn as saved in IndexedDB, once it is done (its segments are the source of truth). */
async function storedTurn(t) {
  return t.waitFor(
    async () => {
      const turn = await t.page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('jarvis');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        try {
          if (!db.objectStoreNames.contains('conversations')) return null;
          const all = await new Promise((resolve, reject) => {
            const r = db.transaction('conversations', 'readonly').objectStore('conversations').getAll();
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          const convs = all.filter((c) => c && Array.isArray(c.turns)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          const turns = convs[0] ? convs[0].turns : [];
          return [...turns].reverse().find((x) => x && x.role === 'jarvis') || null;
        } finally {
          db.close();
        }
      });
      return turn && turn.status === 'done' ? turn : null;
    },
    { timeout: 10000, message: 'the finished reply to be saved' },
  );
}

/** Tap the Speak button under `turn` and wait until reading ends; returns what was said meanwhile. */
async function readAloud(t, turn, { timeout = 60000 } = {}) {
  const btn = turn.locator(tid('turn-speak'));
  await btn.scrollIntoViewIfNeeded();
  const before = (await voiceState(t)).said.length;
  await btn.click();
  await t.waitFor(async () => (await btn.getAttribute('aria-label')) === 'Stop reading', { timeout: 5000, message: 'the Speak button to show "Stop" while it reads' });
  await t.waitFor(async () => (await btn.getAttribute('aria-label')) === 'Read reply aloud', {
    timeout,
    message: async () => `the Speak button to return to "Speak" when reading ends (said so far: ${(await voiceState(t)).said.length - before} chunks)`,
  });
  t.assert((await t.text(btn)) === 'Speak', `The button reads "Speak" again (got "${await t.text(btn)}")`);
  const v = await voiceState(t);
  return { said: v.said.slice(before), v };
}

export default [
  {
    name: 'chat-read-aloud-whole',
    title: 'Chat: the Speak button reads the whole answer (every paragraph, heading, list item and table row), then returns to Speak',
    device: 'desktop',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.goto('/');
      const turn = await t.send('[[long]] Explain home EV charging');
      await t.waitForTurn(turn, ['done']);
      const expected = toSpeech(finalAnswerMarkdown(await storedTurn(t)), 'full');
      const lines = expected.split('\n');
      t.assert(lines.length >= 12, `The answer has many blocks to read (${lines.length})`);

      const { said } = await readAloud(t, turn);
      t.assert(said.length >= lines.length, `Each paragraph or list item is its own chunk at least (${said.length} chunks for ${lines.length} lines)`);
      t.assert(norm(said.join(' ')) === norm(expected), `Everything is read, once, in order.\nexpected: ${norm(expected).slice(0, 300)}…\nsaid:     ${norm(said.join(' ')).slice(0, 300)}…`);
      for (const line of [lines[0], lines[Math.floor(lines.length / 2)], lines.at(-1)]) t.assert(said.some((c) => c.includes(line)), `"${line}" was read`);
      t.assert(said.every((c) => c.length <= 360), 'Chunks stay within the on-device limit');
      t.note(`${said.length} chunks, ${norm(expected).length} characters`);
    },
  },

  {
    name: 'voice-spoken-channel',
    title: 'Installed app: a Voice Mode question carries the spoken reply channel; a message typed in the chat afterwards does not',
    device: 'iphone13',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(emulateStandalone);
      await t.page.addInitScript(installFakeSpeech);
      await t.goto('/');
      t.assert(await t.page.evaluate(() => navigator.standalone === true), 'Running as the installed app');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      const turn = await waitForNewTurn(t, 0);
      await t.waitForTurn(turn, ['done']);
      const spoken = lastTurnContext(t);
      t.assert(spoken.spoken, `The Voice Mode turn's context has "Reply channel: spoken": ${spoken.raw.slice(0, 400)}`);
      t.assert(/^Mode: [^\n]*\nReply channel: spoken\. /m.test(spoken.raw), 'The channel block comes right after the Mode line');
      t.assert(/a line containing only ---/.test(spoken.raw), 'It explains the --- line for details on screen');

      await (await t.visible('voice-close')).click();
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
      const typed = await t.send('Thanks. And what about Germany, what is its capital?');
      await t.waitForTurn(typed, ['done']);
      const chat = lastTurnContext(t);
      t.assert(chat.present && !chat.spoken && !/Reply channel/.test(chat.raw), `A typed chat message is written for the screen: ${chat.raw.slice(0, 300)}`);
      const answer = finalAnswerMarkdown(await storedTurn(t));
      t.assert(/Berlin/.test(answer) && !cutAtBreak(answer, true).cut, 'The chat reply is a normal answer (no spoken part and --- line)');
      t.assertAppendOnly();
    },
  },

  {
    name: 'voice-streams-speech',
    title: 'Voice Mode speaks the reply while it streams: the whole spoken part, nothing below ---, captions follow, it listens again; Read full answer reads everything',
    device: 'iphone13',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech); // hears "What is the capital of France?"
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      const vm = await t.visible('voice-mode');
      const turn = await waitForNewTurn(t, 0);

      await t.step('speech starts while the reply is still streaming', async () => {
        const first = await t.waitFor(async () => (await voiceState(t)).log.find((e) => /The capital of France is Paris\./.test(e.text)), {
          timeout: 20000,
          message: 'the first sentence to be spoken',
        });
        t.assert(first.running, 'The first sentence was spoken before the turn ended');
        t.assert(first.speech === 'live', `It was spoken from the stream (data-speech "${first.speech}")`);
        t.assert(/The capital of France is Paris\./.test(first.captions), `The captions show it as it is spoken (got "${first.captions}")`);
        await t.waitForTurn(turn, ['done']);
      });

      const md = finalAnswerMarkdown(await storedTurn(t));
      const above = cutAtBreak(md, true);
      t.assert(above.cut, 'The spoken reply has a --- line with details below it');
      const spokenPart = markdownToPlainText(above.text, { speech: true });

      await t.step('the whole spoken part, once, and nothing below the line', async () => {
        await t.waitFor(async () => norm((await voiceState(t)).said.join(' ')).length >= norm(spokenPart).length, { timeout: 15000, message: 'the whole spoken part to be spoken' });
        const v = await voiceState(t);
        t.assert(norm(v.said.join(' ')) === norm(spokenPart), `Exactly the spoken part.\nexpected: ${norm(spokenPart)}\nsaid:     ${norm(v.said.join(' '))}`);
        t.assert(!NEVER_SPOKEN.test(v.said.join(' ')), 'Nothing below the --- line is spoken');
        // The captions grew sentence by sentence: when the last one started, they held the whole spoken part.
        const caps = norm(v.log.at(-1).captions);
        t.assert(caps === norm(spokenPart), `The captions hold what was spoken (got "${caps}")`);
        t.assert(v.log.every((e) => e.speech === 'live' && norm(e.captions).includes(norm(e.text))), 'Each sentence was in the captions when it was spoken');
      });

      await t.step('with Continuous on, it listens again after the speech ends', async () => {
        const v = await t.waitFor(async () => {
          const s = await voiceState(t);
          return s.listenLog.length >= 2 ? s : null;
        }, { timeout: 15000, message: 'Voice Mode to listen again' });
        const lastEnd = Math.max(...v.log.map((e) => e.endAt || e.at));
        t.assert(v.listenLog[1] >= lastEnd, `The microphone opened after the voice finished (listen at ${Math.round(v.listenLog[1])} ms, speech ended at ${Math.round(lastEnd)} ms)`);
        await t.screenshot('1-listening-after-reply');
      });

      await t.step('"Read full answer" reads everything, including the details', async () => {
        const pill = await t.visible('voice-read-full', { message: 'The details below the line offer "Read full answer"' });
        const before = (await voiceState(t)).said.length;
        await pill.click();
        const expected = norm(markdownToPlainText(md, { speech: true }));
        await t.waitFor(async () => norm((await voiceState(t)).said.slice(before).join(' ')).length >= expected.length, { timeout: 15000, message: 'the whole answer to be read' });
        const full = norm((await voiceState(t)).said.slice(before).join(' '));
        t.assert(full === expected, `The whole answer, from the top, details included.\nexpected: ${expected}\nsaid:     ${full}`);
        t.assert(full.startsWith(norm(spokenPart)) && /Details\./.test(full) && /Louvre/.test(full) && /Next step/.test(full), 'Spoken part, then the details');
        await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 15000, message: 'the reading to end' });
      });
    },
  },

  {
    name: 'voice-search-preamble',
    title: 'Voice Mode: "Let me check the latest on that." is spoken while the search runs, then the answer',
    device: 'iphone13',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[search]] What is new with home batteries?'];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      const turn = await waitForNewTurn(t, 0);
      const pre = await t.waitFor(async () => (await voiceState(t)).log.find((e) => e.text.includes('Let me check the latest on that.')), { timeout: 20000, message: 'the preamble to be spoken' });
      t.assert(pre.running && !pre.searchDone, `The preamble was spoken while the search was still running (running ${pre.running}, search done ${pre.searchDone})`);
      await t.waitForTurn(turn, ['done']);
      t.assert((await turn.locator(tid('segment-tool')).count()) >= 1, 'The search ran');
      const v = await t.waitFor(async () => {
        const s = await voiceState(t);
        return s.said.some((x) => /Here's what I found/.test(x)) ? s : null;
      }, { timeout: 15000, message: 'the answer to be spoken' });
      const all = v.said.join(' ');
      t.assert(all.indexOf('Let me check the latest on that.') < all.indexOf("Here's what I found"), 'The preamble first, then the answer');
      t.assert((all.match(/Let me check the latest on that\./g) || []).length === 1, 'The preamble is spoken once');
      t.assert(!NEVER_SPOKEN.test(all), 'Sources and details below the line are not spoken');
    },
  },

  {
    name: 'voice-spoken-cap',
    title: 'Voice Mode: a long spoken reply stops after about 1,500 characters with "The rest is on screen."',
    device: 'iphone13',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[longspoken]] What is the capital of France?'];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      const turn = await waitForNewTurn(t, 0);
      await t.waitForTurn(turn, ['done'], { timeout: 45000 });
      const v = await t.waitFor(async () => {
        const s = await voiceState(t);
        return s.said.some((x) => x.includes('The rest is on screen.')) ? s : null;
      }, { timeout: 20000, message: '"The rest is on screen."' });
      const all = norm(v.said.join(' '));
      t.assert(/^The capital of France is Paris\./.test(all) && /Eighth, the community forums/.test(all), 'From the start through the eighth point');
      t.assert(!/Ninth,|Tenth,|Eleventh,|Finally, none of this/.test(all), 'Nothing past the cap');
      t.assert(all.endsWith('The rest is on screen.') && all.split('The rest is on screen.').length === 2, 'It closes once with "The rest is on screen."');
      t.assert(all.length <= 1550 && all.length >= 1400, `About 1,500 characters (${all.length})`);
      t.assert(!NEVER_SPOKEN.test(all), 'Nothing below the line');
      await t.visible('voice-read-full', { message: 'The rest is offered: "Read full answer"' });
      t.note(`${all.length} characters spoken`);
    },
  },

  {
    name: 'voice-barge-in',
    title: 'Voice Mode: a tap on the core while Jarvis speaks a reply still being written stops both and listens; the reply so far stays in the chat',
    device: 'iphone13',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { durationMs: 2500 }); // each sentence plays for 2.5 s
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[slow]] [[longspoken]] What is the capital of France?'];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      const vm = await t.visible('voice-mode');
      const turn = await waitForNewTurn(t, 0);
      await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'speaking', { timeout: 20000, message: 'Jarvis to start speaking' });
      t.assert((await turn.getAttribute('data-status')) === 'running', 'The reply is still being written');
      const before = await voiceState(t);
      await (await t.visible('voice-core')).click();
      await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 5000, message: 'Voice Mode to listen at once' });
      await t.waitForTurn(turn, ['stopped'], { timeout: 10000 });
      const after = await voiceState(t);
      t.assert(after.listenLog.length > before.listenLog.length, `It listened again right away (${before.listenLog.length} → ${after.listenLog.length} listens)`);
      await t.page.waitForTimeout(1500);
      t.assert((await voiceState(t)).said.length === after.said.length, 'Nothing more was spoken after the tap');
      t.assert(/The capital of France is Paris\./.test(await t.text(turn)), 'What was written so far stays in the chat');
      await t.screenshot('1-listening-after-interrupt');
    },
  },

  {
    name: 'quirky-engine',
    title: 'Speak on a long answer with a quirky speech engine (speaking stuck on, missing end events, a dropped utterance): every chunk is spoken and the button resets',
    device: 'desktop',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { quirks: { stuckSpeaking: true, dropEnd: [1, 3, 6], dropSpeak: [0] } });
      await t.goto('/');
      const turn = await t.send('[[long]] Explain home EV charging');
      await t.waitForTurn(turn, ['done']);
      const expected = toSpeech(finalAnswerMarkdown(await storedTurn(t)), 'full');

      const { said, v } = await readAloud(t, turn, { timeout: 90000 });
      t.assert(v.dropped.length === 1, `The engine dropped one utterance (${v.dropped.length})`);
      t.assert(norm(said.join(' ')) === norm(expected), `Every chunk was still spoken, once, in order.\nexpected: ${norm(expected).slice(0, 300)}…\nsaid:     ${norm(said.join(' ')).slice(0, 300)}…`);
      t.assert(said[0] === v.dropped[0], 'The dropped chunk was spoken again');
      t.assert(await t.page.evaluate(() => window.speechSynthesis.speaking === true), 'The engine still claims to be speaking (the quirk), yet the button reset');
      t.note(`${said.length} chunks`);
    },
  },

  {
    name: 'settings-voice',
    title: 'Settings → Voice: Speak replies labels, voices ranked best first with quality and "online" labels, the iPhone voice tip, Test voice uses the chosen voice',
    device: 'iphone13',
    timeout: 60000,
    async run(t) {
      const voices = [
        { name: 'Daniel', lang: 'en-GB', voiceURI: 'com.apple.voice.compact.en-GB.Daniel', localService: true, default: false },
        { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha', localService: true, default: true },
        { name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'Google UK English Male', localService: false, default: false },
        { name: 'Thomas', lang: 'fr-FR', voiceURI: 'com.apple.voice.compact.fr-FR.Thomas', localService: true, default: false },
        { name: 'Daniel', lang: 'en-GB', voiceURI: 'com.apple.voice.enhanced.en-GB.Daniel', localService: true, default: false },
        { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB', voiceURI: 'ms-ryan', localService: false, default: false },
        { name: 'Arthur', lang: 'en-GB', voiceURI: 'com.apple.voice.premium.en-GB.Arthur', localService: true, default: false },
      ];
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { voices });
      await t.goto('/');
      await (await t.visible('settings-button')).click();
      await t.visible('settings-sheet');

      await t.step('Speak replies: Off, Short summary, Whole reply', async () => {
        const select = await t.visible('setting-speakReplies');
        await select.scrollIntoViewIfNeeded();
        const options = await select.locator('option').evaluateAll((els) => els.map((o) => [o.value, o.textContent]));
        t.assert(JSON.stringify(options) === JSON.stringify([['off', 'Off'], ['summary', 'Short summary'], ['full', 'Whole reply']]), `Options: ${JSON.stringify(options)}`);
        const help = await t.text(t.page.locator(tid('settings-sheet')));
        t.assert(/Short summary: its opening paragraph/.test(help) && /Whole reply: all of it/.test(help), 'The help says what each one does');
      });

      await t.step('the voice picker: best first, with quality and "online"', async () => {
        const select = await t.visible('setting-voiceURI');
        await select.scrollIntoViewIfNeeded();
        const options = await t.waitFor(async () => {
          const list = await select.locator('option').evaluateAll((els) => els.map((o) => ({ value: o.value, text: o.textContent, quality: o.dataset.quality || '', online: o.dataset.online || '' })));
          return list.length === voices.length + 1 ? list : null;
        }, { timeout: 5000, message: 'the voice list to fill' });
        t.assert(options[0].value === '' && options[0].text === 'Automatic — Arthur (Premium)', `Automatic picks the best on-device British voice (got "${options[0].text}")`);
        const order = rankVoices(voices).map((v) => v.voiceURI);
        t.assert(JSON.stringify(options.slice(1).map((o) => o.value)) === JSON.stringify(order), `Ranked best first: ${options.slice(1).map((o) => o.text).join(' | ')}`);
        const labels = options.map((o) => o.text);
        for (const label of [
          'Arthur (en-GB, Premium)',
          'Daniel (en-GB, Enhanced)',
          'Daniel (en-GB)',
          'Samantha (en-US)',
          'Google UK English Male (en-GB, online)',
          'Microsoft Ryan Online (Natural) - English (United Kingdom) (en-GB, online)',
          'Thomas (fr-FR)',
        ]) {
          t.assert(labels.includes(label), `"${label}" is listed (${labels.join(' | ')})`);
        }
        t.assert(labels.indexOf('Daniel (en-GB)') < labels.indexOf('Google UK English Male (en-GB, online)'), 'On-device voices before online ones');
        t.assert(options.find((o) => o.value === 'com.apple.voice.premium.en-GB.Arthur').quality === 'premium', 'data-quality');
        t.assert(options.find((o) => o.value === 'ms-ryan').online === 'true', 'data-online');
      });

      await t.step('the "Get a more natural voice" tip, for iPhone', async () => {
        const tip = await t.visible('voice-tip');
        t.assert((await tip.getAttribute('data-platform')) === 'ios', `Worded for iPhone (got ${await tip.getAttribute('data-platform')})`);
        const text = await t.text(tip);
        t.assert(/Get a more natural voice/.test(text) && /Spoken Content → Voices → English/.test(text) && /Enhanced or Premium/.test(text), `Tip: ${text}`);
        await tip.scrollIntoViewIfNeeded();
        await t.screenshot('1-voice-settings');
      });

      await t.step('Test voice speaks with the chosen voice', async () => {
        const select = t.page.locator(tid('setting-voiceURI'));
        await select.selectOption('com.apple.voice.enhanced.en-GB.Daniel');
        await t.waitFor(async () => (await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1')).voiceURI)) === 'com.apple.voice.enhanced.en-GB.Daniel', { timeout: 3000, message: 'the choice to be saved' });
        const before = (await voiceState(t)).log.length;
        await t.page.locator(tid('settings-sheet')).getByRole('button', { name: 'Test voice' }).click();
        const entry = await t.waitFor(async () => (await voiceState(t)).log.slice(before).find((e) => /All systems are operational/.test(e.text)), { timeout: 5000, message: 'the test phrase' });
        t.assert(entry.voice === 'com.apple.voice.enhanced.en-GB.Daniel', `Spoken with the chosen voice (got ${entry.voice})`);
        t.assert(/Tony/.test(entry.text), 'It greets the owner by name');
      });
    },
  },
];
