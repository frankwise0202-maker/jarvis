// The end-to-end test server: one port, routed by host name.
//   127.0.0.1:<port>         the mock Claude API (POST /v1/messages, GET /v1/models, /__mock/*),
//                            and the fake home base relay (/api/relay/*: helpers/fake-relay.mjs, or the
//                            relay a scenario plugs in with useRelay(serve))
//   app.localhost:<port>     only once a scenario calls serveApp(page): Jarvis's own source modules
//                            (/src/**, as the browser loads them) and that page at /, for
//                            chrome-relay-roundtrip
//   <site>.localhost:<port>  the local test websites (sites.mjs)
//
//   const srv = await startExtensionTestServer();  // { port, apiBase, siteUrl(site, path), mock, sites, relay, close }

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClaudeMock, writeResponse } from './mock/claude-mock.mjs';
import { createSites } from './sites.mjs';
import { createFakeRelay } from './helpers/fake-relay.mjs';
import { createStaticHandler } from '../../scripts/serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function startExtensionTestServer({ port = 0 } = {}) {
  const mock = createClaudeMock();
  const relay = createFakeRelay();
  let relayServe = null; // a relay a scenario plugged in: (req, res, bodyText) => Promise
  let appPage = null; // the page app.localhost serves at / (chrome-relay-roundtrip)
  const appStatic = createStaticHandler({ root: REPO, spaFallback: false });
  let sites = createSites();
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const host = String(req.headers.host || '').split(':')[0];
      try {
        if (host === '127.0.0.1' && req.url.startsWith('/api/relay/')) {
          await (relayServe || relay.serve)(req, res, body);
        } else if (host === 'app.localhost' && appPage !== null) {
          const pathname = new URL(req.url, 'http://app.localhost').pathname;
          if (pathname === '/') res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(appPage);
          else if (pathname.startsWith('/src/') && !pathname.includes('..')) await appStatic(req, res);
          else res.writeHead(404).end();
        } else if (host === '127.0.0.1') {
          const out = await mock.handle({ method: req.method, url: req.url, headers: req.headers, bodyText: body });
          await writeResponse(mock, res, out, req);
        } else {
          sites.handle(req, res, body);
        }
      } catch (err) {
        console.error('[test server]', err);
        if (!res.headersSent) res.writeHead(500).end();
        else res.destroy();
      }
    });
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const p = server.address().port;
  return {
    port: p,
    apiBase: `http://127.0.0.1:${p}`,
    siteUrl: (site, path = '/') => `http://${site}.localhost:${p}${path}`,
    mock,
    relay,
    /** Answers /api/relay/* with another relay (null: back to the fake). */
    useRelay(serve) {
      relayServe = serve;
    },
    /** Serves Jarvis's source modules and `html` at http://app.localhost:<port>/ (null: stops). */
    serveApp(html) {
      appPage = html;
      return `http://app.localhost:${p}/`;
    },
    get sites() {
      return sites;
    },
    resetSites() {
      sites = createSites();
      return sites;
    },
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
