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

async function playerState(locator) {
  return locator.locator(tid('music-player')).getAttribute('data-state');
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
        t.assert(t.music.searches.length >= 1 && t.music.searches.every((u) => u.startsWith('https://itunes.apple.com/search?') && /media=music/.test(u) && /country=us/.test(u)), `searched the iTunes API (${t.music.searches.join(' ')})`);
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
];
