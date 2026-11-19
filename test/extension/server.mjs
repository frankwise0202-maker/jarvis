// The end-to-end test server: one port, routed by host name.
//   127.0.0.1:<port>         the mock Claude API (POST /v1/messages, GET /v1/models, /__mock/*)
//   <site>.localhost:<port>  the local test websites (sites.mjs)
//
//   const srv = await startExtensionTestServer();  // { port, apiBase, siteUrl(site, path), mock, sites, close }

import http from 'node:http';
import { createClaudeMock, writeResponse } from './mock/claude-mock.mjs';
import { createSites } from './sites.mjs';

export async function startExtensionTestServer({ port = 0 } = {}) {
  const mock = createClaudeMock();
  let sites = createSites();
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const host = String(req.headers.host || '').split(':')[0];
      try {
        if (host === '127.0.0.1') {
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
