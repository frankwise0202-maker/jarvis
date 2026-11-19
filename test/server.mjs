#!/usr/bin/env node
// Test server (SPEC §11): one HTTP server on a free port that serves dist/ (with SPA fallback)
// AND the strict mock Claude API (/v1/messages + /__mock/*) on the same origin, so the app's CSP
// (connect-src 'self') allows it and the app can point its API base at location.origin.
//
//   import { startTestServer } from './server.mjs';
//   const { url, close, mock } = await startTestServer();
//   // url: 'http://127.0.0.1:<port>'  mock: the mock instance (requests, violations, reset())
//
// Options: { port = 0, host = '127.0.0.1', root = dist/, build = 'if-missing' | 'always' | 'never',
//            mock: { timeScale, … } (createMock options), quiet = true }
//
// Run directly for manual testing:  node test/server.mjs [--port 8650] [--build]

import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, ROOT } from '../scripts/build.mjs';
import { createStaticHandler } from '../scripts/serve.mjs';
import { createMockHandler } from './mock/anthropic-mock.mjs';

export const MOCK_API_KEY = 'sk-ant-test-0123456789abcdefghijklmnop';

export async function startTestServer(options = {}) {
  const { port = 0, host = '127.0.0.1', root = path.join(ROOT, 'dist'), quiet = true } = options;
  const buildMode = options.build ?? 'if-missing';
  if (buildMode === 'always' || (buildMode === 'if-missing' && !existsSync(path.join(root, 'index.html')))) {
    await build({ quiet });
  }
  const mockHandler = createMockHandler(options.mock || {});
  const staticHandler = createStaticHandler({ root, spaFallback: true });
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    mockHandler(req, res, () => staticHandler(req, res)).catch((err) => {
      console.error('test server error:', err);
      if (!res.headersSent) res.writeHead(500).end();
      else res.destroy();
    });
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const url = `http://${host}:${server.address().port}`;
  let closed = false;
  const close = () =>
    new Promise((resolve) => {
      if (closed) return resolve();
      closed = true;
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    });
  return { url, origin: url, port: server.address().port, mock: mockHandler.mock, server, close };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const portArg = argv.indexOf('--port');
  const port = portArg >= 0 ? Number(argv[portArg + 1]) : 0;
  startTestServer({ port, build: argv.includes('--build') ? 'always' : 'if-missing', quiet: false, mock: { verbose: true } })
    .then(({ url, close }) => {
      console.log(`\nJarvis test server (app + mock Claude API) at ${url}/\n`);
      console.log('To use the mock from the app, open the URL, then run this in the browser console:\n');
      console.log(`  localStorage.setItem('jarvis.dev.apiBase', location.origin);`);
      console.log(`  localStorage.setItem('jarvis.apiKey', '${MOCK_API_KEY}');`);
      console.log(`  localStorage.setItem('jarvis.settings.v1', JSON.stringify({ onboarded: true, userName: 'Tony' }));`);
      console.log('  location.reload();\n');
      console.log('Directives such as [[swarm:6]], [[search]], [[slow]], [[xss]] script the mock (see README).');
      console.log(`Mock log: ${url}/__mock/requests   violations: ${url}/__mock/violations\n`);
      const stop = () => close().then(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    })
    .catch((err) => {
      console.error(`✖ ${err.message || err}`);
      process.exit(1);
    });
}
