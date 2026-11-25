// Fixture mode (and the tests): weather, geocoding and the news feeds answered from core/fixtures/brain
// instead of the internet, so a simulated home base shows a full morning briefing offline.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRAIN_FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/brain');

const ROUTES = [
  [/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/, 'forecast.json', 'application/json'],
  [/^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?.*name=(?:nowhere|zzz)/i, 'geocode-none.json', 'application/json'],
  [/^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?/, 'geocode.json', 'application/json'],
  [/^https:\/\/feeds\.npr\.org\//, 'npr.xml', 'application/rss+xml'],
  [/^https:\/\/feeds\.bbci\.co\.uk\//, 'bbc.xml', 'application/rss+xml'],
  [/^https:\/\/feeds\.arstechnica\.com\//, 'ars.xml', 'application/rss+xml'],
  [/^https:\/\/www\.theverge\.com\/rss\//, 'verge.xml', 'application/atom+xml'],
];

/** A fetch() that serves the fixtures; anything else is a network error. `calls` lists the URLs asked for. */
export function createFixtureFetch({ dir = BRAIN_FIXTURES, overrides = {} } = {}) {
  const calls = [];
  async function fixtureFetch(url, init = {}) {
    const u = String(url);
    calls.push(u);
    if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const [re, value] of Object.entries(overrides)) {
      if (new RegExp(re).test(u)) {
        if (value instanceof Error) throw value;
        if (typeof value === 'function') return value(u, init);
        return new Response(value, { status: 200 });
      }
    }
    const hit = ROUTES.find(([re]) => re.test(u));
    if (!hit) throw Object.assign(new TypeError('fetch failed'), { code: 'ENOTFOUND' });
    return new Response(fs.readFileSync(path.join(dir, hit[1])), { status: 200, headers: { 'content-type': hit[2] } });
  }
  fixtureFetch.calls = calls;
  return fixtureFetch;
}
