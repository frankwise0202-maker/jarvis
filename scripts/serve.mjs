#!/usr/bin/env node
// Serve Jarvis locally (SPEC §11): a zero-dependency static server for dist/.
//
//   node scripts/serve.mjs [--port 8642] [--host 0.0.0.0] [--rebuild]
//   (PORT and HOST environment variables work too)
//
// Builds first when dist/ is missing (or with --rebuild), then serves dist/ with correct MIME
// types, no directory traversal, SPA fallback to index.html for page navigations, and
// Cache-Control: no-cache (always revalidate; ETag makes that cheap). Prints the local URL and
// the LAN URLs for phones on the same Wi-Fi.
//
// `createStaticHandler()` is also used by test/server.mjs.

import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, BuildError, ROOT } from './build.mjs';

export const DEFAULT_PORT = 8642;
export const DIST = path.join(ROOT, 'dist');

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

export function contentTypeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/**
 * (req, res) handler serving files from `root`. Unknown paths that look like page navigations
 * (no file extension, or .html) fall back to root/index.html when `spaFallback` is on; other
 * misses are 404s so a missing script never comes back as HTML.
 */
export function createStaticHandler({ root = DIST, spaFallback = true } = {}) {
  const base = path.resolve(root);

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers });
    res.end(body);
  };

  async function serveFile(req, res, file) {
    const info = await stat(file);
    const name = path.basename(file);
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      'content-type': contentTypeFor(file),
      'cache-control': 'no-cache', // always revalidate (index.html and sw.js must never be stale)
      etag,
      'last-modified': info.mtime.toUTCString(),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    };
    if (name === 'sw.js') headers['service-worker-allowed'] = './';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    headers['content-length'] = info.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  async function resolveFile(rel) {
    const target = path.resolve(base, `.${path.posix.sep}${rel}`);
    if (target !== base && !target.startsWith(base + path.sep)) return null; // traversal
    try {
      const info = await stat(target);
      if (info.isFile()) return target;
      if (info.isDirectory()) {
        const index = path.join(target, 'index.html');
        if (existsSync(index)) return index;
      }
    } catch {
      /* not found */
    }
    return null;
  }

  return async function staticHandler(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, 'Method Not Allowed', { allow: 'GET, HEAD' });
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
      } catch {
        send(res, 400, 'Bad Request');
        return;
      }
      const segments = pathname.split('/').filter(Boolean);
      if (pathname.includes('\0') || pathname.includes('\\') || segments.includes('..')) {
        send(res, 400, 'Bad Request');
        return;
      }
      if (segments.some((s) => s.startsWith('.') && s !== '.well-known')) {
        send(res, 404, 'Not Found');
        return;
      }
      const file = await resolveFile(segments.join('/'));
      if (file) {
        await serveFile(req, res, file);
        return;
      }
      const last = segments[segments.length - 1] || '';
      const looksLikePage = !path.extname(last) || last.endsWith('.html');
      const index = path.join(base, 'index.html');
      if (spaFallback && looksLikePage && existsSync(index)) {
        await serveFile(req, res, index);
        return;
      }
      send(res, 404, 'Not Found');
    } catch (err) {
      if (!res.headersSent) send(res, 500, 'Internal Server Error');
      else res.destroy();
      console.error('serve error:', err?.message || err);
    }
  };
}

/** IPv4 LAN URLs for this machine. */
export function lanUrls(port) {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${port}/`);
    }
  }
  return urls;
}

/** Build if needed, then serve dist/. Resolves to { server, url, close }. */
export async function serve({ port = DEFAULT_PORT, host = '0.0.0.0', rebuild = false, root = DIST, quiet = false } = {}) {
  if (rebuild || !existsSync(path.join(root, 'index.html'))) {
    if (!quiet) console.log(rebuild ? 'Building…' : 'dist/ is missing, building first…');
    await build({ quiet });
  }
  const handler = createStaticHandler({ root });
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const actualPort = server.address().port;
  const url = `http://localhost:${actualPort}/`;
  if (!quiet) {
    console.log('\nJarvis is running.\n');
    console.log(`  On this computer:  ${url}`);
    if (host === '0.0.0.0' || host === '::') {
      for (const lan of lanUrls(actualPort)) console.log(`  On your network:   ${lan}`);
      console.log('\n  Phones on the same Wi-Fi can open the network address, but installing the app,');
      console.log('  the microphone and offline mode need HTTPS: use the GitHub Pages link for that.');
    }
    console.log('\n  Press Ctrl+C to stop.\n');
  }
  const close = () =>
    new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  return { server, url, port: actualPort, close };
}

function parseArgs(argv) {
  const envPort = process.env.PORT;
  const opts = { port: envPort !== undefined && envPort.trim() !== '' ? Number(envPort) : DEFAULT_PORT, host: process.env.HOST || '0.0.0.0', rebuild: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') opts.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7));
    else if (a === '--host') opts.host = argv[++i];
    else if (a.startsWith('--host=')) opts.host = a.slice(7);
    else if (a === '--rebuild' || a === '--build') opts.rebuild = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/serve.mjs [--port 8642] [--host 0.0.0.0] [--rebuild]');
      process.exit(0);
    }
  }
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    console.error(`Invalid port: ${opts.port}`);
    process.exit(1);
  }
  return opts;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  serve(opts)
    .then(({ close }) => {
      const stop = () => close().then(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    })
    .catch((err) => {
      if (err instanceof BuildError) console.error(`\n✖ ${err.message}`);
      else if (err?.code === 'EADDRINUSE') console.error(`\n✖ Port ${opts.port} is already in use. Try another one, e.g.  PORT=${opts.port + 1} npm start`);
      else console.error(`\n✖ ${err?.stack || err}`);
      process.exit(1);
    });
}
