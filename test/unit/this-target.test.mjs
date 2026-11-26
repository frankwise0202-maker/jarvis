// v8.1 contract (c): resolveThis(), what "this" means right now (src/lib/this-target.js; u-voice §3.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveThis, safeUrl } from '../../src/lib/this-target.js';

const all = {
  linkOnScreen: { url: 'https://example.com/a', title: 'Example page' },
  look: { labels: ['USB-C charger', { text: 'Desk lamp' }], selected: 1 },
  liveSummary: 'A hand holding a 65-watt charger',
  hologram: { title: 'Laptop', part: 'battery' },
  reply: { links: ['https://example.com/1', 'https://example.com/2'] },
  lastQuestion: 'what is the best laptop under 800 dollars',
};

test('the first that is there wins: link, look, live, hologram, reply, question, none', () => {
  assert.deepEqual(resolveThis(all), { kind: 'link', words: 'Example page', url: 'https://example.com/a' });
  const noLink = { ...all, linkOnScreen: null };
  assert.deepEqual(resolveThis(noLink), { kind: 'look', words: 'Desk lamp' });
  const noLook = { ...noLink, look: null };
  assert.deepEqual(resolveThis(noLook), { kind: 'live', words: 'A hand holding a 65-watt charger' });
  const noLive = { ...noLook, liveSummary: '' };
  assert.deepEqual(resolveThis(noLive), { kind: 'hologram', words: 'Laptop battery' });
  const noHologram = { ...noLive, hologram: null };
  assert.deepEqual(resolveThis(noHologram), { kind: 'reply', words: '', url: 'https://example.com/1', urls: ['https://example.com/1', 'https://example.com/2'] });
  const noReply = { ...noHologram, reply: { links: [] } };
  assert.deepEqual(resolveThis(noReply), { kind: 'question', words: 'what is the best laptop under 800 dollars' });
  assert.deepEqual(resolveThis({}), { kind: 'none', words: '' });
  assert.deepEqual(resolveThis(), { kind: 'none', words: '' });
});

test('a Look: the tapped label, else the first; none without labels', () => {
  assert.equal(resolveThis({ look: { labels: ['AA battery', 'Coffee mug'], selected: null } }).words, 'AA battery');
  assert.equal(resolveThis({ look: { labels: ['AA battery', 'Coffee mug'], selected: 7 } }).words, 'AA battery');
  assert.equal(resolveThis({ look: { labels: [], selected: 0 }, lastQuestion: 'what is this' }).kind, 'question');
  assert.equal(resolveThis({ linkOnScreen: 'https://example.com/x' }).words, 'https://example.com/x', 'a link without a title');
});

test('only http and https links without credentials count', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'https://user:pass@example.com/', 'ftp://example.com/', 'example.com', '']) {
    assert.equal(safeUrl(bad), '', bad);
    assert.equal(resolveThis({ linkOnScreen: bad }).kind, 'none', bad);
  }
  assert.deepEqual(resolveThis({ reply: { links: ['javascript:alert(1)', 'https://ok.example/', { url: 'https://ok.example/' }] } }), { kind: 'reply', words: '', url: 'https://ok.example/', urls: ['https://ok.example/'] });
});

test('words are one plain line of at most 200 characters', () => {
  const r = resolveThis({ liveSummary: `two\nlines\u0007 and ${'x'.repeat(300)}` });
  assert.equal(r.kind, 'live');
  assert.ok(!/[\n\u0007]/.test(r.words));
  assert.ok(r.words.length <= 200);
  assert.ok(r.words.startsWith('two lines and'));
});
