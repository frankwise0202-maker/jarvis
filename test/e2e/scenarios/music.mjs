// Apple Music (find & open, free): "play Back in Black" typed in the chat or said in Voice Mode is
// found in Apple Music on the device (no Claude request) and shown as a Music card with a 30-second
// preview and Open in Apple Music; Jarvis's find_music tool (lead tools V6) shows cards for his own
// picks; the card fits a 320 px phone. The iTunes API, the artwork and the previews are faked with
// route() (test/e2e/music-fakes.mjs): nothing reaches the network.

import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';

const card = (t, testid = 'music-card', page = t.page) => page.locator(tid(testid)).last();

async function waitCard(t, testid = 'music-card', status = 'done', timeout = 15000) {
  await t.waitFor(async () => (await card(t, testid).getAttribute('data-status').catch(() => null)) === status, {
    timeout,
    message: async () => `the ${testid} to be ${status} (is ${await card(t, testid).getAttribute('data-status').catch(() => 'missing')})`,
  });
  return card(t, testid);
}

/**
 * Wait until the entrance animations around `locator` (its turn's fade-up, the card's own) have
 * finished: a box measured mid-animation is translated by a fraction of a pixel and its height can
 * come out as 43.99997 px.
 */
async function settled(locator) {
  await locator.evaluate((el) => {
    const host = el.closest('.turn') || el.closest('[data-testid$="music-card"]') || el;
    const anims = [...host.getAnimations({ subtree: true }), ...(host.parentElement ? host.parentElement.getAnimations() : [])];
    // Only the ones that end (a pulsing dot or a spinner never does).
    const ending = anims.filter((a) => a.effect && Number.isFinite(a.effect.getComputedTiming().endTime));
    return Promise.all(ending.map((a) => a.finished.catch(() => null)));
  });
}

async function playerState(locator) {
  return locator.locator(tid('music-player')).getAttribute('data-state');
}

/** Where the Voice Mode card's buttons are, and whether a tap at their centre reaches them. */
function voiceCardLayout(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) };
    };
    const hit = (el) => {
      const b = el.getBoundingClientRect();
      const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!at && (at === el || el.contains(at));
    };
    const out = { vw: innerWidth, vh: innerHeight, dockTop: Math.round(document.querySelector('.vm-bottom').getBoundingClientRect().top), scrollW: document.documentElement.scrollWidth };
    for (const id of ['music-preview', 'music-open']) {
      const el = document.querySelector(`[data-testid="voice-music"] [data-testid="${id}"]`);
      out[id] = el ? { ...box(el), hit: hit(el) } : null;
    }
    const alts = document.querySelector('[data-testid="voice-music"] [data-testid="music-alts"]');
    out.altsShown = !!alts && alts.getBoundingClientRect().height > 0;
    return out;
  });
}

async function toastText(t) {
  return t.text(t.page.locator('.toast, [data-testid="toast"]').last()).catch(() => '');
}

// ---- with listening (v7.2): the recognizer's other readings and the 2-second check --------------

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const say = (t, item) => t.page.evaluate((x) => window.__voice.say(x), item);
const said = (t) => t.page.evaluate(() => window.__voice.said.slice());

/** Counts each time Voice Mode's 2-second check or the chat's countdown comes on screen (init script). */
function watchChecks() {
  const seen = { review: 0, countdown: 0 };
  window.__checks = seen;
  const was = { review: false, countdown: false };
  const tick = () => {
    for (const [key, id] of [['review', 'voice-review'], ['countdown', 'composer-countdown']]) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      const on = !!el && !el.hidden;
      if (on && !was[key]) seen[key] += 1;
      was[key] = on;
    }
  };
  new MutationObserver(tick).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
}
const checks = (t) => t.page.evaluate(() => ({ ...window.__checks }));

/** The owner's words in every request Jarvis (the lead model) got. */
function sentTexts(t) {
  return t.requests('lead').map((r) => {
    const msgs = r.body?.messages || [];
    const user = [...msgs].reverse().find((m) => m.role === 'user');
    const blocks = Array.isArray(user?.content) ? user.content.filter((b) => b.type === 'text') : [];
    return norm(blocks.at(-1)?.text || '');
  });
}

/** Voice Mode listens for a new request (not the 2-second check); `tap`: tap the core when it waits. */
async function voiceListening(t, message = 'Voice Mode to listen', { tap = true } = {}) {
  const vm = t.page.locator(tid('voice-mode'));
  const ready = async (states) => states.includes(await vm.getAttribute('data-state')) && !(await t.page.locator(tid('voice-review')).isVisible());
  await t.waitFor(() => ready(tap ? ['listening', 'idle'] : ['listening']), { timeout: 30000, message });
  if ((await vm.getAttribute('data-state')) !== 'listening') await t.page.locator(tid('voice-core')).click();
  await t.waitFor(() => ready(['listening']), { timeout: 8000, message });
}

async function checkShows(t, words) {
  await t.waitFor(async () => (await t.page.locator(tid('voice-review')).isVisible()) && norm(await t.text(t.page.locator(tid('voice-review-text')))) === words, {
    timeout: 15000,
    message: async () => `the 2-second check to show "${words}" (it shows "${norm(await t.text(t.page.locator(tid('voice-review-text'))).catch(() => ''))}")`,
  });
}

export default [
  {
    name: 'music-chat',
    title: '"play Back in Black" in the chat: a free Music card (no Claude request) with artwork, AC/DC, the album and year, Open in Apple Music (and the Music app on a Mac), a 30-second preview that plays and pauses, alternatives; "stop the music"; it is kept after a reload; questions with "play" still go to Jarvis',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');

      let c;
      await t.step('typed: found in Apple Music, no Claude request', async () => {
        const turn = await t.send('play Back in Black');
        c = await waitCard(t);
        t.assert((await t.text(c.locator(tid('music-title')))) === 'Back In Black', `title: ${await t.text(c.locator(tid('music-title')))}`);
        t.assert((await t.text(c.locator(tid('music-artist')))) === 'AC/DC', `artist: ${await t.text(c.locator(tid('music-artist')))}`);
        t.assert(/Back In Black · 1980/.test(await t.text(c.locator(tid('music-sub')))), `album · year: ${await t.text(c.locator(tid('music-sub')))}`);
        const line = await t.text(turn.locator(tid('segment-text')).first());
        t.assert(line === 'Here’s Back In Black by AC/DC. Tap Open in Apple Music to play it.', `Jarvis's line: "${line}"`);
        t.assert(t.requests('lead').length === 0, `no Claude request for a local music command (${t.requests('lead').length})`);
        // No media=music: Apple would answer an iPhone with a redirect to the Music app (music-fakes.mjs).
        t.assert(t.music.searches.length >= 1 && t.music.searches.every((u) => u.startsWith('https://itunes.apple.com/search?') && /entity=song/.test(u) && !/[?&]media=/.test(u) && /country=us/.test(u)), `searched the iTunes API (${t.music.searches.join(' ')})`);
        t.assert(/term=back\+in\+black/.test(t.music.searches[0]), `the words searched: ${t.music.searches[0]}`);
        t.assert(/^Free · Apple Music$/.test(await t.text(turn.locator(tid('turn-stats')))), `stats: ${await t.text(turn.locator(tid('turn-stats')))}`);
        await t.waitFor(() => c.locator('img.music-art-img').evaluate((img) => img.complete && img.naturalWidth > 0 && img.dataset.loaded === 'true'), { timeout: 8000, message: 'the artwork to load' });
        const src = await c.locator('img.music-art-img').getAttribute('src');
        t.assert(/^https:\/\/is1-ssl\.mzstatic\.com\/.+\/300x300bb\.jpg$/.test(src), `artwork resized to 300 px from Apple's host: ${src}`);
      });

      await t.step('Open in Apple Music (https) and, on a Mac, Open in Music app (music://)', async () => {
        const open = c.locator(tid('music-open'));
        const href = await open.getAttribute('href');
        t.assert(href === 'https://music.apple.com/us/album/back-in-black/574050396?i=574050602', `Open in Apple Music: ${href}`);
        t.assert((await open.getAttribute('target')) === '_blank' && /noopener/.test((await open.getAttribute('rel')) || ''), 'a new tab, noopener');
        const app = await c.locator(tid('music-open-app')).getAttribute('href');
        t.assert(app === 'music://music.apple.com/us/album/back-in-black/574050396?i=574050602', `Open in Music app: ${app}`);
        await settled(open); // measured mid-entrance (translateY), the box can be 43.99997 px
        const box = await open.boundingBox();
        t.assert(box && box.height >= 44, `44 px target (${box && box.height})`);
        await t.screenshot('card');
      });

      await t.step('Preview plays 30 seconds in Jarvis, and pauses', async () => {
        const btn = c.locator(tid('music-preview'));
        await btn.click();
        await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 10000, message: async () => `the preview to play (${await playerState(c)})` });
        t.assert((await btn.getAttribute('aria-pressed')) === 'true', 'Pause is pressed');
        t.assert(t.music.previews >= 1, 'the preview came from audio-ssl.itunes.apple.com');
        await t.waitFor(async () => Number(await c.locator(tid('music-progress')).getAttribute('aria-valuenow')) >= 1, { timeout: 8000, message: 'the progress to move' });
        await t.screenshot('preview-playing');
        await btn.click();
        await t.waitFor(async () => (await playerState(c)) === 'paused', { timeout: 5000, message: async () => `the preview to pause (${await playerState(c)})` });
      });

      await t.step('alternatives swap in; "stop the music" stops a preview', async () => {
        const alts = c.locator(tid('music-alt'));
        t.assert((await alts.count()) >= 1, 'another version is offered');
        await alts.first().click();
        t.assert((await t.text(c.locator(tid('music-artist')))) === 'Thunderstruck', `the alternative is shown: ${await t.text(c.locator(tid('music-artist')))}`);
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 10000, message: 'the alternative to play' });
        const turns = await t.count('turn-jarvis');
        const input = await t.visible('composer-input');
        await input.fill('stop the music');
        await input.press('Enter');
        await t.waitFor(async () => (await playerState(c)) === 'idle', { timeout: 5000, message: async () => `the preview to stop (${await playerState(c)})` });
        t.assert((await t.count('turn-jarvis')) === turns, '"stop the music" adds nothing to the chat');
      });

      await t.step('kept after a reload', async () => {
        await t.reload();
        const again = await waitCard(t);
        t.assert((await again.locator(tid('music-open')).getAttribute('href')) === 'https://music.apple.com/us/album/back-in-black/574050396?i=574050602', 'the card and its link are back');
      });

      await t.step('"play" in an ordinary question goes to Jarvis', async () => {
        const turn = await t.send('What role does OPEC play in oil prices?');
        await t.waitForTurn(turn, ['done']);
        t.assert(t.requests('lead').length === 1, 'the question went to Claude');
        t.assert((await turn.locator(tid('music-card')).count()) === 0, 'no Music card for it');
        const lead = t.requests('lead')[0].body;
        t.assert(lead.tools.at(-1).name === 'find_music' && lead.system[0].text.includes('# Music\n'), 'a new conversation has the V6 tools (find_music) and the V5 prompt');
        t.assert(!JSON.stringify(lead.messages).includes('Back In Black'), 'the local exchange is not sent to Claude');
      });

      await t.step('"play some AC/DC": the artist\'s own songs, not one where AC/DC is only featured', async () => {
        await t.send('play some AC/DC');
        const top = await waitCard(t);
        t.assert((await t.text(top.locator(tid('music-artist')))) === 'AC/DC' && (await t.text(top.locator(tid('music-title')))) === 'Back In Black', `the first song: ${await t.text(top.locator(tid('music-title')))} by ${await t.text(top.locator(tid('music-artist')))}`);
        const lookup = t.music.searches.find((u) => u.startsWith('https://itunes.apple.com/lookup?'));
        t.assert(lookup && /[?&]limit=25(?:&|$)/.test(lookup), `the lookup asks for 25 songs: ${lookup}`);
        const alts = await top.locator(tid('music-alt')).allTextContents();
        t.assert(alts.length === 3 && /The Test Guests/.test(alts[2]), `AC/DC's own songs, then the featured one: ${JSON.stringify(alts)}`);
      });
    },
  },

  {
    name: 'music-voice',
    title: 'Voice Mode: "Play Back in Black." → Jarvis says one short line and shows the card; he waits instead of listening, so Preview plays; tapping the core to talk pauses it (never while the mic listens)',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['Play Back in Black.'];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      const c = await waitCard(t, 'voice-music-card');
      t.assert((await t.text(c.locator(tid('music-title')))) === 'Back In Black', 'the card in Voice Mode');
      await t.waitFor(async () => /Back In Black.*Open in Apple Music/i.test(await t.page.evaluate(() => window.__voice.said.join(' '))), {
        timeout: 15000,
        message: async () => `Jarvis to say the line (said: ${await t.page.evaluate(() => window.__voice.said.join(' | '))})`,
      });
      const said = await t.page.evaluate(() => window.__voice.said);
      t.assert(said.length === 1, `one short line (${JSON.stringify(said)})`);
      t.assert(t.requests('lead').length === 0, 'free: no Claude request');
      await t.waitFor(async () => /Ready/.test(await t.text(await t.visible('voice-status'))), { timeout: 8000, message: 'Voice Mode to wait (Ready)' });
      await t.page.waitForTimeout(1200);
      t.assert((await t.page.evaluate(() => window.__voice.listens)) === 1, 'he does not listen again on his own (the owner may tap Preview)');
      await t.screenshot('voice-card');

      await c.locator(tid('music-preview')).click();
      await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 10000, message: async () => `the preview to play (${await playerState(c)})` });
      await (await t.visible('voice-core')).click();
      await t.waitFor(async () => (await playerState(c)) !== 'playing', { timeout: 5000, message: 'the preview to pause before the mic listens' });
      t.assert((await t.page.evaluate(() => window.__voice.listens)) === 2, 'the tap listened');
      await (await t.visible('voice-close')).click();
      // The exchange is in the chat too.
      await t.waitFor(async () => (await t.count('music-card')) === 1, { timeout: 5000, message: 'the Music card in the chat' });
    },
  },

  {
    name: 'music-voice-small',
    title: 'Voice Mode on small phones (375×667, then 320×568): the whole card fits above the dock, so Preview and Open in Apple Music take a tap without scrolling; "Also found" stays in the chat',
    device: 'small',
    fakeMusic: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['Jarvis, play Back in Black'];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await waitCard(t, 'voice-music-card');
      await t.waitFor(async () => /Ready/.test(await t.text(await t.visible('voice-status'))), { timeout: 10000, message: 'Voice Mode to wait (Ready)' });
      for (const [w, hgt] of [[375, 667], [320, 568]]) {
        await t.page.setViewportSize({ width: w, height: hgt });
        await t.page.waitForTimeout(400);
        const m = await voiceCardLayout(t.page);
        for (const id of ['music-preview', 'music-open']) {
          const b = m[id];
          t.assert(b && b.hit && b.bottom <= m.dockTop && b.top >= 0, `${w}×${hgt}: ${id} takes a tap above the dock (${JSON.stringify(b)}, dock at ${m.dockTop})`);
        }
        t.assert(!m.altsShown, `${w}×${hgt}: "Also found" is not in Voice Mode`);
        t.assert(m.scrollW <= w, `${w}×${hgt}: no sideways scroll (${m.scrollW})`);
        await t.screenshot(`voice-${w}`);
      }
    },
  },

  {
    name: 'music-voice-cards',
    title: 'Voice Mode: a reply with two find_music picks shows both cards (not just the last), and the hint names what the cards offer: Preview for a song with a clip, Open in Apple Music for an album',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[music:recommend]] Play something for a rainy Sunday afternoon'];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      const hint = t.page.locator('.vm-cap-sub');
      await t.waitFor(async () => (await t.page.locator(tid('voice-music-card')).count()) === 2, { timeout: 30000, message: async () => `two cards in Voice Mode (${await t.page.locator(tid('voice-music-card')).count()})` });
      await t.waitFor(async () => /Ready/.test(await t.text(await t.visible('voice-status'))), { timeout: 30000, message: 'the reply to be said (Ready)' });
      const titles = await t.page.locator(`${tid('voice-music')} ${tid('music-title')}`).allTextContents();
      t.assert(JSON.stringify(titles) === JSON.stringify(['Riders On the Storm', 'Come Away With Me']), `both picks: ${JSON.stringify(titles)}`);
      await t.waitFor(async () => (await t.text(hint)) === 'Tap Preview to hear a clip, or the core to talk.', { timeout: 5000, message: async () => `the hint for a song with a clip (${await t.text(hint)})` });
      await t.screenshot('two-cards');

      await t.page.evaluate(() => {
        window.__voice.queue = ['play the album Rumours'];
      });
      await (await t.visible('voice-core')).click();
      await t.waitFor(async () => (await t.page.locator(tid('voice-music-card')).count()) === 1 && (await t.text(t.page.locator(`${tid('voice-music')} ${tid('music-title')}`))) === 'Rumours', {
        timeout: 15000,
        message: 'the album card replaces the picks',
      });
      await t.waitFor(async () => /Ready/.test(await t.text(await t.visible('voice-status'))), { timeout: 15000, message: 'Ready after the line' });
      await t.waitFor(async () => (await t.text(hint)) === 'Tap Open in Apple Music to play it, or the core to talk.', { timeout: 5000, message: async () => `no "Preview" in the hint for an album (${await t.text(hint)})` });
    },
  },

  {
    name: 'music-media',
    title: 'Previews and Jarvis\'s voice never overlap: Speak (chat) and a spoken reply (Voice Mode) pause a preview; the chat\'s mic note says "Tap the mic"; previews and artwork carry no Apple cookies',
    device: 'mac',
    fakeMusic: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      const ctx = t.page.context();
      await ctx.addCookies([
        { name: 'appleid_session', value: 'SECRET123', domain: '.apple.com', path: '/', secure: true, sameSite: 'None', httpOnly: true },
        { name: 'mz_art', value: 'ART456', domain: '.mzstatic.com', path: '/', secure: true, sameSite: 'None' },
      ]);
      const sent = { preview: [], art: [], search: [] };
      const watch = (key) => async (route) => {
        sent[key].push((await route.request().allHeaders()).cookie || '');
        return route.fallback();
      };
      await ctx.route(/^https:\/\/audio-ssl\.itunes\.apple\.com\//, watch('preview'));
      await ctx.route(/^https:\/\/is\d{1,2}-ssl\.mzstatic\.com\//, watch('art'));
      await ctx.route(/^https:\/\/itunes\.apple\.com\//, watch('search'));
      await t.page.addInitScript(installFakeSpeech, { durationMs: 4000 });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      const turn = await t.send('play Back in Black');
      const c = await waitCard(t);

      await t.step('no Apple cookies with the search, the artwork or the preview', async () => {
        t.assert((await c.locator('img.music-art-img').getAttribute('crossorigin')) === 'anonymous', 'the artwork is loaded anonymously');
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 10000, message: 'the preview to play' });
        await t.waitFor(() => sent.art.length > 0 && sent.preview.length > 0, { timeout: 5000, message: 'the artwork and preview requests' });
        t.assert([...sent.search, ...sent.art, ...sent.preview].every((cookie) => cookie === ''), `no cookies sent: ${JSON.stringify(sent)}`);
      });

      await t.step('Speak on the reply pauses the preview', async () => {
        await turn.locator(tid('turn-speak')).click();
        await t.waitFor(async () => (await playerState(c)) === 'paused', { timeout: 5000, message: async () => `the preview to pause while Jarvis reads (${await playerState(c)})` });
        t.assert(await t.page.evaluate(() => window.speechSynthesis.speaking), 'Jarvis reads the reply');
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 5000, message: 'Resume plays again' });
        await t.waitFor(() => t.page.evaluate(() => !window.speechSynthesis.speaking), { timeout: 5000, message: 'and Jarvis stops reading' });
      });

      await t.step('the chat\'s mic: the preview pauses, and the note says "Tap the mic"', async () => {
        await (await t.visible('composer-mic')).click();
        await t.waitFor(async () => (await playerState(c)) !== 'playing', { timeout: 5000, message: 'the preview to pause before the mic listens' });
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => /Tap the mic to stop listening first\./.test(await toastText(t)), { timeout: 5000, message: async () => `the note (${await toastText(t)})` });
        t.assert(!/core/.test(await toastText(t)), 'no "core" in the chat');
        t.assert((await playerState(c)) !== 'playing', 'nothing plays while the mic listens');
        await (await t.visible('composer-mic')).click();
      });

      await t.step('Voice Mode: a spoken reply pauses a preview', async () => {
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 10000, message: async () => `the preview to play again (${await playerState(c)})` });
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        await (await t.visible('voice-type-toggle')).click();
        await (await t.visible('voice-input')).fill('What role does OPEC play in oil prices?');
        await (await t.visible('voice-send')).click();
        await t.waitFor(() => t.page.evaluate(() => window.speechSynthesis.speaking), { timeout: 20000, message: 'Jarvis to speak the reply' });
        await t.waitFor(async () => (await playerState(c)) === 'paused', { timeout: 5000, message: async () => `the preview to pause while Jarvis speaks (${await playerState(c)})` });
      });
    },
  },

  {
    name: 'music-tool',
    title: 'Jarvis recommends (lead tools V6): two find_music calls show two cards (a song with a preview, an album without), the results Claude gets are compact and link-free, and he never claims to play anything',
    device: 'desktop',
    fakeMusic: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[music:recommend]] Play something for a rainy Sunday afternoon');
      await t.waitForTurn(turn, ['done'], { timeout: 60000 });
      const cards = turn.locator(tid('music-card'));
      t.assert((await cards.count()) === 2, `two cards (${await cards.count()})`);
      const [song, album] = [cards.nth(0), cards.nth(1)];
      t.assert((await t.text(song.locator(tid('music-title')))) === 'Riders On the Storm' && (await t.text(song.locator(tid('music-artist')))) === 'The Doors', 'the song');
      t.assert(await song.locator(tid('music-player')).isVisible(), 'the song has a preview');
      t.assert((await t.text(album.locator(tid('music-title')))) === 'Come Away With Me' && /^Album · 14 songs · 2002$/.test(await t.text(album.locator(tid('music-sub')))), `the album: ${await t.text(album.locator(tid('music-sub')))}`);
      t.assert(!(await album.locator(tid('music-player')).isVisible()), 'an album has no preview button');
      t.assert(/^https:\/\/music\.apple\.com\/us\/album\/x\/1440787218$/.test(await album.locator(tid('music-open')).getAttribute('href')), 'the album opens in Apple Music');
      const text = await t.text(turn.locator(tid('segment-text')).last());
      t.assert(/Riders On the Storm by The Doors and Come Away With Me by Norah Jones/.test(text) && !/playing now|is playing/i.test(text), `the sentence: ${text}`);
      const leads = t.requests('lead');
      t.assert(leads.length === 2, `the picks, then the sentence (${leads.length} requests)`);
      const results = leads[1].body.messages.at(-1).content.filter((b) => b.type === 'tool_result');
      t.assert(results.length === 2, 'both results went back');
      const all = results.map((r) => (typeof r.content === 'string' ? r.content : JSON.stringify(r.content))).join('\n');
      t.assert(/Song "Riders On the Storm" by The Doors/.test(all) && /Album "Come Away With Me" by Norah Jones/.test(all), `results: ${all.slice(0, 300)}`);
      t.assert(!/https?:\/\//.test(all), 'no links in the results Claude gets');
      t.assertAppendOnly();
      await t.screenshot('recommendations');
    },
  },

  {
    name: 'music-phone',
    title: 'The Music card at 320 px: no sideways scroll, artwork and text fit, every control at least 44 px, readable contrast',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.setViewportSize({ width: 320, height: 640 });
      await t.goto('/');
      await t.send('Jarvis, play Back in Black by AC/DC.');
      const c = await waitCard(t);
      await t.checkNoHorizontalOverflow('music card at 320 px');
      const box = await c.boundingBox();
      t.assert(box && box.x >= 0 && box.x + box.width <= 320, `the card fits (${box && Math.round(box.x)}–${box && Math.round(box.x + box.width)})`);
      await settled(c);
      for (const id of ['music-preview', 'music-open', 'music-alt']) {
        const b = await c.locator(tid(id)).first().boundingBox();
        t.assert(b && b.height >= 44 && b.width >= 44, `${id} is at least 44 px (${b && `${Math.round(b.width)}×${Math.round(b.height)}`})`);
      }
      t.assert((await c.locator(tid('music-open-app')).count()) === 0, 'no Music app link on a phone');
      // AA contrast of the card's text on its surface (the darker gradient stop is the worst case).
      const ratios = await c.evaluate((el) => {
        const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const lum = ([r, g, b]) => {
          const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const bg = rgb(getComputedStyle(document.body).backgroundColor);
        const out = {};
        for (const sel of ['.music-title', '.music-artist', '.music-sub', '.music-kicker', '.music-alt-meta', '.music-time']) {
          const node = el.querySelector(sel);
          if (!node) continue;
          const fg = rgb(getComputedStyle(node).color);
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          out[sel] = Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
        }
        return out;
      });
      for (const [sel, r] of Object.entries(ratios)) t.assert(r >= 4.5, `${sel} contrast ${r}:1 (AA 4.5:1)`);
      await t.screenshot('320');
    },
  },

  {
    name: 'music-voice-listen',
    title:
      'Voice Mode with listening (v7.2): a misheard "play" is found by the recognizer\'s other reading, at once with no 2-second check; while a check shows the cards step aside and no preview plays, and "cancel" brings them back; another reading that is a camera command comes first, and a question about a part of the hologram on screen is never taken for music',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 8000 });
      await t.page.addInitScript(watchChecks);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await voiceListening(t);

      let c;
      await t.step('"Clay Back in Black" heard, "Play Back in Black" the other reading: the card at once, free, no check', async () => {
        await say(t, { parts: [{ at: 100, text: 'Clay Back in Black', alts: ['Play Back in Black'] }] });
        c = await waitCard(t, 'voice-music-card');
        t.assert((await t.text(c.locator(tid('music-title')))) === 'Back In Black', 'the song meant');
        const asked = norm(await t.text(t.page.locator(tid('turn-user')).last()));
        t.assert(asked === 'Play Back in Black', `the reading taken is the owner's line in the chat (${asked})`);
        await t.waitFor(async () => (await said(t)).some((x) => /Back In Black by AC\/DC/.test(x)), { timeout: 15000, message: 'Jarvis to say the line' });
        t.assert((await checks(t)).review === 0, 'a music command acts at once: no 2-second check');
        t.assert(t.requests('lead').length === 0, 'free: no Claude request');
        await t.waitFor(async () => /Ready/.test(await t.text(await t.visible('voice-status'))), { timeout: 8000, message: 'Voice Mode to wait for a tap (Ready)' });
      });

      await t.step('a question: while the check shows, the card steps aside and no preview plays; Cancel brings it back', async () => {
        await voiceListening(t);
        await say(t, 'Who sang it first');
        await checkShows(t, 'Who sang it first');
        await t.page.locator(tid('voice-review-text')).click(); // fixing the words: the countdown waits
        await t.visible('voice-review-input');
        t.assert(await t.page.locator(tid('voice-music')).isHidden(), 'the cards step aside for the check');
        // Even a tap that reached the hidden card would not play while the words are checked.
        await t.page.evaluate(() => document.querySelector('[data-testid="voice-music"] [data-testid="music-preview"]').click());
        await t.page.waitForTimeout(400);
        t.assert((await playerState(c)) !== 'playing', `no preview during the check (${await playerState(c)})`);
        await t.screenshot('check-over-card');
        await t.page.locator(tid('voice-review-cancel')).click();
        await t.waitFor(async () => /Okay, not sent\./.test(await t.text(t.page.locator(tid('voice-captions')))), { timeout: 8000, message: '"Okay, not sent."' });
        await t.waitFor(() => t.page.locator(tid('voice-music')).isVisible(), { timeout: 3000, message: 'the card to be back' });
        t.assert((await t.text(c.locator(tid('music-title')))) === 'Back In Black', 'the same card');
        t.assert(sentTexts(t).length === 0, 'nothing was sent');
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 10000, message: 'Preview to play once the check is gone' });
      });

      await t.step('another reading that is a camera command comes before one that is a music command', async () => {
        await voiceListening(t, 'Voice Mode to listen again');
        t.assert((await playerState(c)) !== 'playing', 'the preview paused for the mic');
        const searches = t.music.searches.length;
        await say(t, { parts: [{ at: 100, text: 'What am I locking at?', alts: ['Play Locking At', 'What am I looking at?'] }] });
        await t.waitFor(async () => (await said(t)).some((x) => /Tap Look, and show me\./.test(x)), { timeout: 10000, message: 'Jarvis to ask for Look' });
        t.assert(t.music.searches.length === searches, `Apple Music was not searched (${t.music.searches.slice(searches).join(' ')})`);
        t.assert(sentTexts(t).length === 0, 'nothing was sent');
      });

      await t.step('with a hologram on screen, a question naming one of its parts is sent, not taken for music by another reading', async () => {
        await voiceListening(t, 'Voice Mode to be ready');
        await say(t, { parts: [{ at: 100, text: '[[hologram:battery]] Show me an AA battery' }] });
        await t.visible('hologram-viewer', { timeout: 30000, message: 'The hologram viewer opens over Voice Mode' });
        await t.waitFor(async () => (await t.page.locator(tid('hologram-viewer')).getAttribute('data-state')) === 'ready', { timeout: 60000, message: 'the hologram to be built' });
        await t.waitFor(async () => /Say "expand it", or tap any part\./.test((await said(t)).join(' ')), { timeout: 30000, message: 'Jarvis to say the hologram is up' });
        // The viewer covers Voice Mode: it listens again by itself (Continuous).
        await voiceListening(t, 'Voice Mode to listen again under the viewer', { tap: false });
        const searches = t.music.searches.length;
        const before = sentTexts(t).length;
        await say(t, { parts: [{ at: 100, text: 'How does the separator work?', alts: ['Play the separator'] }] });
        await checkShows(t, 'How does the separator work?');
        await t.waitFor(() => sentTexts(t).length > before, { timeout: 10000, message: 'the question to be sent' });
        t.assert(sentTexts(t).at(-1).includes('How does the separator work?'), `the question was sent ("${sentTexts(t).at(-1)}")`);
        t.assert(t.music.searches.length === searches, `Apple Music was not searched (${t.music.searches.slice(searches).join(' ')})`);
      });
    },
  },

  {
    name: 'music-chat-mic',
    musicPreviewSeconds: 20, // a pause is told from the clip's end
    title:
      'The chat\'s mic with listening (v7.2): a music command acts at once with no countdown, also when only the recognizer\'s other reading is one; a question waits 2 seconds in the box, and a preview waits for it too (the card says why), then plays; the hologram viewer\'s own mic pauses a playing preview, and none starts while it listens',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 8000 });
      await t.page.addInitScript(watchChecks);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await t.visible('empty-state');

      let c;
      await t.step('"Clay Back in Black" heard, "Play Back in Black" the other reading: found at once, no countdown', async () => {
        await t.page.evaluate(() => window.__voice.queue.push({ parts: [{ at: 100, text: 'Clay Back in Black', alts: ['Play Back in Black'] }] }));
        await (await t.visible('composer-mic')).click();
        c = await waitCard(t);
        t.assert((await t.text(c.locator(tid('music-title')))) === 'Back In Black', 'the song meant');
        t.assert(/^Play Back in Black$/.test(norm(await t.text(t.page.locator(tid('turn-user')).first()))), `the reading taken is the owner's line (${norm(await t.text(t.page.locator(tid('turn-user')).first()))})`);
        t.assert((await checks(t)).countdown === 0, 'a music command acts at once: no countdown');
        t.assert((await t.page.locator(tid('composer-input')).inputValue()) === '', 'the box is empty');
        t.assert(t.requests('lead').length === 0, 'free: no Claude request');
      });

      await t.step('a question waits 2 seconds in the box; a preview waits for it too, then plays', async () => {
        await t.page.evaluate(() => window.__voice.queue.push('What is the capital of France?'));
        await (await t.visible('composer-mic')).click();
        await t.visible('composer-countdown', { timeout: 8000, message: 'The countdown shows' });
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => /The preview waits while what you said is about to be sent\./.test(await toastText(t)), { timeout: 5000, message: async () => `the note (${await toastText(t)})` });
        t.assert((await playerState(c)) !== 'playing', 'no preview during the check');
        await t.waitFor(async () => (await t.count('turn-user')) === 2, { timeout: 8000, message: 'the question to be sent after the countdown' });
        await t.waitFor(() => sentTexts(t).some((x) => x.includes('What is the capital of France?')), { timeout: 8000, message: 'the question to reach Jarvis' });
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).last(), ['done']);
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 10000, message: 'Preview to play once the words are sent' });
      });

      await t.step('the hologram viewer\'s own mic pauses a playing preview before it listens', async () => {
        await c.locator(tid('music-preview')).click(); // pause while the hologram is asked for (a reply read aloud would pause it anyway)
        const turn = await t.send('[[hologram:battery]] Show me an AA battery');
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        await c.locator(tid('music-preview')).click();
        await t.waitFor(async () => (await playerState(c)) === 'playing', { timeout: 10000, message: 'the preview to play again' });
        await turn.locator(tid('hologram-card')).locator(tid('hologram-open')).click();
        await t.visible('hologram-viewer');
        t.assert((await playerState(c)) === 'playing', 'the preview plays on while the hologram is looked at');
        await (await t.visible('hologram-mic')).click();
        await t.waitFor(async () => (await playerState(c)) === 'paused', { timeout: 5000, message: async () => `the preview to pause before the viewer's mic listens (${await playerState(c)})` });
        t.assert((await t.page.locator(tid('hologram-mic')).getAttribute('aria-pressed')) === 'true', 'the viewer\'s mic listens');
        // Even a tap that reached the card behind the viewer would not play while that mic listens.
        await t.page.evaluate(() => [...document.querySelectorAll('[data-testid="music-card"] [data-testid="music-preview"]')].at(-1).click());
        await t.page.waitForTimeout(400);
        t.assert((await playerState(c)) === 'paused', `no preview while the viewer's mic listens (${await playerState(c)})`);
      });
    },
  },
];
