// The Music card (Apple Music, find & open): a song or album found in Apple Music, with its
// artwork, title, artist, album and year, a 30-second Preview (a mini player: play/pause and
// progress), Open in Apple Music (the https link: the Music app on an iPhone, the web player
// elsewhere) and, on a Mac, Open in Music app (the music:// form of the same link), plus up to
// four alternatives that swap in with a tap. Used in the chat (a `music` segment) and in Voice Mode.
//
//   const view = createMusicCardView({ player, isMac, notify, micHint });
//   (micHint: how to stop the mic where the card is: "Tap the mic …" in the chat, "Tap the core …"
//   in Voice Mode)
//   view.update(segment)   // { status: 'searching' | 'done' | 'error', query, searchKind, items, error }
//   view.el, view.destroy()
//
// Every URL is re-checked against Apple's hosts here (src/lib/music.js), whatever the segment says
// (a stored conversation or a backup may be damaged or made by someone else). Text goes in with
// textContent only.

import { h, setText } from '../dom.js';
import { icon } from '../icons.js';
import { cleanMusicItems, describeItem, formatDuration, itemSubtitle, musicAppLink, musicLink } from '../../lib/music.js';

const MAX_ALTERNATIVES = 4;
const ERROR_TEXT = {
  offline: 'You’re offline, so Apple Music couldn’t be searched.',
  timeout: 'Apple Music took too long to answer. Ask again in a moment.',
};

/** Whether this device is a Mac (not an iPad that says it is one). */
export function isMacDevice(nav = typeof navigator !== 'undefined' ? navigator : null) {
  try {
    const ua = String((nav && nav.userAgent) || '');
    return /Macintosh/.test(ua) && !(Number(nav.maxTouchPoints) > 1);
  } catch {
    return false;
  }
}

export function createMusicCardView({ player = null, isMac = false, notify = null, testid = 'music-card', micHint = 'Tap the mic to stop listening first.' } = {}) {
  let seg = null;
  let items = [];
  let selected = 0;
  let unsub = null;

  // Shown once loaded (data-loaded), so a broken or slow image never shows as a broken icon. Loaded
  // without cookies or referrer (crossorigin anonymous: mzstatic.com answers Access-Control-Allow-Origin: *).
  const art = h('img', { class: 'music-art-img', alt: '', attrs: { decoding: 'async', referrerpolicy: 'no-referrer', crossorigin: 'anonymous', width: '96', height: '96' } });
  const artFallback = h('span', { class: 'music-art-fallback', attrs: { 'aria-hidden': 'true' } }, icon('wave', { size: 30 }));
  const artBox = h('div', { class: 'music-art' }, artFallback, art);
  art.addEventListener('error', () => {
    delete art.dataset.loaded;
  });
  art.addEventListener('load', () => {
    if (art.naturalWidth > 0) art.dataset.loaded = 'true';
  });

  const kicker = h('span', { class: 'music-kicker hud-label' });
  const title = h('div', { class: 'music-title', attrs: { 'data-testid': 'music-title' } });
  const artist = h('div', { class: 'music-artist', attrs: { 'data-testid': 'music-artist' } });
  const sub = h('div', { class: 'music-sub', attrs: { 'data-testid': 'music-sub' } });
  const info = h('div', { class: 'music-info' }, kicker, title, artist, sub);

  // The mini player.
  const playIcon = h('span', { class: 'music-play-icon', attrs: { 'aria-hidden': 'true' } }, icon('play', { size: 18 }));
  const playLabel = h('span', { class: 'music-play-label', text: 'Preview' });
  const playBtn = h('button', { class: 'music-play', type: 'button', attrs: { 'data-testid': 'music-preview', 'aria-pressed': 'false' }, on: { click: onPlay } }, playIcon, playLabel);
  const fill = h('span', { class: 'music-progress-fill' });
  const progress = h(
    'div',
    { class: 'music-progress', attrs: { role: 'progressbar', 'aria-label': 'Preview progress', 'aria-valuemin': '0', 'aria-valuemax': '30', 'aria-valuenow': '0', 'data-testid': 'music-progress' } },
    fill,
  );
  const time = h('span', { class: 'music-time', attrs: { 'data-testid': 'music-time', 'aria-hidden': 'true' } });
  const playerRow = h('div', { class: 'music-player', attrs: { 'data-testid': 'music-player', 'data-state': 'idle' } }, playBtn, progress, time);

  // Open in Apple Music (https), and the Music app on a Mac (music://).
  const openLabel = h('span', { text: 'Open in Apple Music' });
  const openLink = h('a', { class: 'btn btn-primary music-open', attrs: { 'data-testid': 'music-open', target: '_blank', rel: 'noopener noreferrer' } }, icon('external', { size: 16 }), openLabel);
  const appLink = isMac ? h('a', { class: 'btn music-open-app', attrs: { 'data-testid': 'music-open-app' } }, icon('laptop', { size: 16 }), h('span', { text: 'Open in Music app' })) : null;
  const actions = h('div', { class: 'music-actions' }, openLink, appLink);

  const altList = h('ul', { class: 'music-alt-list', attrs: { role: 'list' } });
  const alts = h('div', { class: 'music-alts', hidden: true, attrs: { 'data-testid': 'music-alts' } }, h('div', { class: 'music-alts-label hud-label', text: 'Also found' }), altList);

  const main = h('div', { class: 'music-main' }, artBox, info);
  const body = h('div', { class: 'music-body' }, main, playerRow, actions, alts);
  const status = h('p', { class: 'music-status', attrs: { 'data-testid': 'music-status', role: 'status' } });
  const statusRow = h('div', { class: 'music-status-row', hidden: true }, h('span', { class: 'music-status-icon', attrs: { 'aria-hidden': 'true' } }, icon('search', { size: 16 })), status);
  const el = h('div', { class: ['seg', 'seg-music', 'music-card', 'hud-frame'], attrs: { 'data-testid': testid, 'data-status': 'searching', role: 'group', 'aria-label': 'Apple Music' } }, statusRow, body);

  const currentItem = () => items[selected] || null;

  function onPlay() {
    const item = currentItem();
    if (!item || !player) return;
    Promise.resolve(player.toggle(item)).then((res) => {
      if (res && res.ok === false && typeof notify === 'function') {
        if (res.reason === 'listening') notify(`The preview waits while the microphone is listening. ${micHint}`);
        else if (res.reason === 'no-preview') notify('There’s no preview for this one. Tap Open in Apple Music to play it.');
        else if (res.reason === 'error') notify('The preview couldn’t be played. Open it in Apple Music instead.');
      }
    });
  }

  function renderPlayer(s) {
    const item = currentItem();
    const mine = !!(item && s && s.id === `${item.type}:${item.id}`);
    const playing = mine && s.playing;
    const t = mine ? s.time : 0;
    const d = mine && s.duration ? s.duration : 30;
    playerRow.dataset.state = playing ? (s.loading ? 'loading' : 'playing') : mine && t > 0 ? 'paused' : mine && s.error ? 'error' : 'idle';
    playBtn.setAttribute('aria-pressed', String(!!playing));
    playIcon.replaceChildren(icon(playing ? 'pause' : 'play', { size: 18 }));
    setText(playLabel, playing ? 'Pause' : t > 0 ? 'Resume' : 'Preview');
    const name = item ? describeItem(item, { album: false }) : '';
    playBtn.setAttribute('aria-label', playing ? `Pause the preview of ${name}` : `Play a 30-second preview of ${name}`);
    const pct = Math.max(0, Math.min(100, (t / d) * 100));
    fill.style.width = `${pct}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(t)));
    progress.setAttribute('aria-valuemax', String(Math.round(d)));
    setText(time, `${formatDuration(t * 1000) || '0:00'} / ${formatDuration(d * 1000) || '0:30'}`);
  }

  function renderItem() {
    const item = currentItem();
    if (!item) return;
    const kindWord = item.type === 'album' ? 'Album' : 'Song';
    setText(kicker, `Apple Music · ${kindWord}${item.explicit ? ' · Explicit' : ''}`);
    setText(title, item.title);
    setText(artist, item.artist || 'Unknown artist');
    const subtitle = itemSubtitle(item);
    const extra = item.type === 'song' && item.durationMs ? formatDuration(item.durationMs) : '';
    setText(sub, [subtitle, extra].filter(Boolean).join(' · '));
    sub.hidden = !sub.textContent;
    if (item.artwork) {
      if (art.getAttribute('src') !== item.artwork) {
        delete art.dataset.loaded; // until it loads
        art.src = item.artwork;
      }
    } else {
      delete art.dataset.loaded;
      art.removeAttribute('src');
    }
    const link = musicLink(item.url);
    if (link) openLink.href = link;
    else openLink.removeAttribute('href');
    openLink.setAttribute('aria-label', `Open ${describeItem(item)} in Apple Music`);
    if (appLink) {
      const app = musicAppLink(item.url);
      if (app) appLink.href = app;
      else appLink.removeAttribute('href');
      appLink.setAttribute('aria-label', `Open ${describeItem(item)} in the Music app`);
    }
    playerRow.hidden = item.type !== 'song' || !item.previewUrl;
    renderAlternatives();
    renderPlayer(player ? player.state() : null);
  }

  function renderAlternatives() {
    altList.replaceChildren();
    const others = items.map((item, i) => ({ item, i })).filter(({ i }) => i !== selected).slice(0, MAX_ALTERNATIVES);
    for (const { item, i } of others) {
      const meta = [item.type === 'album' ? 'Album' : '', item.artist, item.year ? String(item.year) : ''].filter(Boolean).join(' · ');
      altList.appendChild(
        h(
          'li',
          { class: 'music-alt' },
          h(
            'button',
            {
              class: 'music-alt-btn',
              type: 'button',
              attrs: { 'data-testid': 'music-alt', 'aria-label': `Show ${describeItem(item)}` },
              on: {
                click: () => {
                  if (player && player.isPlaying()) player.stop();
                  selected = i;
                  renderItem();
                  try {
                    openLink.focus({ preventScroll: true });
                  } catch {
                    /* ignore */
                  }
                },
              },
            },
            h('span', { class: 'music-alt-title', text: item.title }),
            h('span', { class: 'music-alt-meta', text: meta }),
          ),
        ),
      );
    }
    alts.hidden = !others.length;
  }

  function update(s) {
    const prevKey = seg ? `${seg.status}|${(seg.items || []).length}` : '';
    seg = s || {};
    const statusName = seg.status === 'searching' ? 'searching' : seg.status === 'error' ? 'error' : 'done';
    const nextItems = statusName === 'done' ? cleanMusicItems(seg.items) : [];
    const changed = prevKey !== `${seg.status}|${(seg.items || []).length}` || nextItems.length !== items.length;
    items = nextItems;
    if (changed) selected = 0;
    if (selected >= items.length) selected = 0;
    el.dataset.status = statusName === 'done' && !items.length ? 'empty' : statusName;
    const q = typeof seg.query === 'string' ? seg.query : '';
    if (statusName === 'searching') {
      setText(status, q ? `Searching Apple Music for “${q}”…` : 'Searching Apple Music…');
    } else if (statusName === 'error') {
      setText(status, ERROR_TEXT[seg.error] || 'Apple Music couldn’t be reached just now. Ask again in a moment.');
    } else if (!items.length) {
      setText(status, q ? `Nothing in Apple Music matched “${q}”.` : 'Nothing in Apple Music matched.');
    } else {
      setText(status, '');
    }
    statusRow.hidden = !status.textContent;
    body.hidden = !items.length;
    if (items.length) renderItem();
  }

  if (player) unsub = player.subscribe((s) => renderPlayer(s));

  return {
    kind: 'music',
    el,
    live: null,
    update,
    /** The item shown (for Voice Mode's line and tests). */
    current: () => currentItem(),
    destroy() {
      if (unsub) unsub();
      unsub = null;
    },
  };
}
