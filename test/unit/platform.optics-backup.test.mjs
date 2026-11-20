// Optics in backups (src/platform/backup.js): a Look's frame record (userTurn.optics) and its pins
// and camera-frame segments survive export → import, re-validated; damaged or hostile values are
// cleaned. Without this, an imported chat would lose its frame ids, and the next Look would reuse
// "f1" while the history still mentions the old f1. Runs in real Chromium (platform.harness).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, PAGE_HTML } from './platform.harness.test.mjs';

let h;
before(async () => {
  h = await createHarness(
    { db: 'src/platform/db.js', backup: 'src/platform/backup.js', prompts: 'src/engine/prompts.js' },
    { routes: { '/app/': { body: PAGE_HTML, type: 'text/html; charset=utf-8' } } },
  );
});
after(async () => {
  if (h) await h.close();
});

test('backup: an Optics Look keeps its frame record, pins and camera frame; bad values are cleaned', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(async () => {
    const { db, backup, prompts } = window.__mods;
    const thumb = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP////8=';
    const usage = { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 };
    const jarvis = (id, segments) => ({ id, role: 'jarvis', status: 'done', createdAt: 1100, endedAt: 1200, mode: 'quick', leadModel: 'claude-opus-5-5', workerModel: 'claude-sonnet-5-5', depth: 'balanced', segments, missions: {}, usage, costUsd: 0.02, stats: { agents: 0, searches: 0, sources: 0, waves: 0, durationMs: 5 }, error: null });
    const conv = {
      id: 'optics-chat', v: 1, title: 'What is on my desk?', createdAt: 1000, updatedAt: 2000, system: prompts.LEAD_SYSTEM_LATEST, tools: prompts.leadToolsLatest(),
      apiMessages: [{ role: 'user', content: [{ type: 'text', text: 'What is on my desk?' }] }, { role: 'assistant', content: [{ type: 'text', text: 'A mug.' }] }],
      turns: [
        { id: 'u1', role: 'user', text: 'What is on my desk?', mode: 'quick', createdAt: 1000, attachments: [{ id: 'a1', kind: 'image', name: 'Optics 21:47', mediaType: 'image/jpeg', size: 1000, thumb, width: 720, height: 1280 }], optics: { frameId: 'f1', width: 720, height: 1280, source: 'rear', capturedAt: 999 } },
        jarvis('j1', [
          { id: 's1', kind: 'text', text: 'A mug.', req: 0, citations: [] },
          { id: 's2', kind: 'pins', req: 0, toolUseId: 'toolu_1', status: 'done', frameId: 'f1', labels: [{ text: 'Coffee mug', x: 219, y: 559 }, { text: `AA battery${String.fromCharCode(0x202e)}<b>`, x: 316, y: 844 }, { text: 'Bad', x: 1.5, y: 3 }, { text: 'Neg', x: -4, y: 3 }], warnings: ['ok'] },
          { id: 's3', kind: 'frame', req: 1, toolUseId: 'toolu_2', frameId: 'f2', width: 1280, height: 720, source: 'rear', reason: 'to see\nit', thumb: 'javascript:alert(1)' },
          { id: 's4', kind: 'pins', req: 1, status: 'live', frameId: 'f2', labels: [{ text: 'Lamp', x: 1, y: 1 }] },
        ]),
        { id: 'u2', role: 'user', text: 'Odd', mode: 'auto', createdAt: 1300, attachments: [{ id: 'a2', kind: 'image', name: 'x', mediaType: 'image/jpeg', size: 1, thumb: null, width: 1, height: 1 }], optics: { frameId: 'nope', width: 9e9, height: 2, source: 'satellite' } },
        jarvis('j2', [{ id: 's5', kind: 'text', text: 'Hm.', req: 0, citations: [] }]),
      ],
      pending: null,
    };
    const result = await backup.importBackup({ app: 'jarvis', version: 1, conversations: [conv] });
    return { result, saved: await db.getConversation('optics-chat') };
  });
  assert.equal(r.result.conversations, 1, JSON.stringify(r.result));
  const [u1, j1, u2] = r.saved.turns;
  assert.deepEqual(u1.optics, { frameId: 'f1', width: 720, height: 1280, source: 'rear', capturedAt: 999 });
  assert.equal(u2.optics, undefined, 'an invalid frame record is dropped');
  const pins = j1.segments.find((s) => s.id === 's2');
  assert.equal(pins.status, 'done');
  assert.equal(pins.frameId, 'f1');
  assert.deepEqual(pins.labels.map((l) => [l.text, l.x, l.y]), [['Coffee mug', 219, 559], ['AA battery <b>', 316, 844]], 'non-integer and negative points dropped; bidi control removed');
  const frame = j1.segments.find((s) => s.id === 's3');
  assert.deepEqual([frame.frameId, frame.width, frame.height, frame.source, frame.reason, frame.thumb], ['f2', 1280, 720, 'rear', 'to see it', null]);
  const live = j1.segments.find((s) => s.id === 's4');
  assert.deepEqual([live.status, live.labels.length], ['error', 0], 'nothing imported is still pinning');
});

test('backup: an Apple Music exchange keeps its card (items re-checked against Apple\'s hosts) and stays local', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(async () => {
    const { db, backup, prompts } = window.__mods;
    const song = {
      type: 'song', id: '574050602', title: 'Back In Black', artist: 'AC/DC', album: 'Back In Black', year: 1980, genre: 'Hard Rock', durationMs: 256000,
      url: 'https://music.apple.com/us/album/back-in-black/574050396?i=574050602', previewUrl: 'https://audio-ssl.itunes.apple.com/a/b.m4a',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/a.jpg/300x300bb.jpg', explicit: false, artistId: '5040714', trackCount: null,
    };
    const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 };
    const conv = {
      id: 'music-chat', v: 1, title: 'play Back in Black', createdAt: 1000, updatedAt: 2000, system: prompts.LEAD_SYSTEM_LATEST, tools: prompts.leadToolsLatest(),
      apiMessages: [],
      turns: [
        { id: 'u1', role: 'user', text: 'play Back in Black', mode: 'auto', createdAt: 1000 },
        {
          id: 'j1', role: 'jarvis', local: 'music', status: 'done', createdAt: 1000, endedAt: 1100, mode: 'auto', leadModel: 'local', workerModel: 'local', depth: 'balanced', missions: {}, usage, costUsd: 0,
          stats: { agents: 0, searches: 0, sources: 0, waves: 0, durationMs: 0 }, error: null,
          segments: [
            { id: 's1', kind: 'text', text: 'Here’s Back In Black by AC/DC.', req: 0, citations: [] },
            { id: 's2', kind: 'music', req: 0, toolUseId: null, status: 'done', query: 'back in black', searchKind: 'song', artist: '', error: null, local: true,
              items: [song, { ...song, id: '1', url: 'https://evil.example/x' }, { ...song, id: '2', previewUrl: 'javascript:alert(1)', artwork: 'https://evil.example/a.jpg' }] },
            { id: 's3', kind: 'music', req: 0, status: 'searching', query: 'x', searchKind: 'podcast', items: [song] },
          ],
        },
      ],
      pending: null,
    };
    const result = await backup.importBackup({ app: 'jarvis', version: 1, conversations: [conv] });
    return { result, saved: await db.getConversation('music-chat') };
  });
  assert.equal(r.result.conversations, 1, JSON.stringify(r.result));
  const j1 = r.saved.turns[1];
  assert.equal(j1.local, 'music');
  const card = j1.segments.find((s) => s.id === 's2');
  assert.deepEqual(card.items.map((i) => [i.id, i.previewUrl, i.artwork]), [
    ['574050602', 'https://audio-ssl.itunes.apple.com/a/b.m4a', 'https://is1-ssl.mzstatic.com/image/thumb/a.jpg/300x300bb.jpg'],
    ['2', null, null],
  ], 'a foreign link drops the item; a foreign preview or artwork is dropped');
  assert.equal(card.local, true);
  const searching = j1.segments.find((s) => s.id === 's3');
  assert.deepEqual([searching.status, searching.items.length, searching.searchKind], ['error', 0, 'song'], 'nothing imported is still searching');
});
