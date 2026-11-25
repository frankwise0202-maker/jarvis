// Static files for the dashboard (core/dashboard by default) at /. No directory listings, no dotfiles,
// no path escapes (checked on the real path, so symlinks cannot lead outside). Files are revalidated on
// every load (ETag), so `jarvis-core update` takes effect on the next reload.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jarvis Core</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#02060b;color:#9fe8ff;font:16px/1.5 system-ui,sans-serif}
main{max-width:34rem;padding:2rem;text-align:center}h1{letter-spacing:.3em;font-weight:500}a{color:#5fd4ff}</style></head>
<body><main><h1>JARVIS CORE</h1><p>The Core is running. The dashboard files are not installed yet.</p>
<p>Live report: <a href="/api/status">/api/status</a> · <a href="/api/info">/api/info</a></p></main></body></html>
`;

export function createStatic({ root, securityHeaders = {} }) {
  let realRoot = null;
  const resolveRoot = async () => {
    try {
      realRoot = await fsp.realpath(root);
    } catch {
      realRoot = null;
    }
    return realRoot;
  };

  /** Serve a GET/HEAD for `pathname`. Returns the status code sent. */
  async function serve(req, res, pathname) {
    const base = await resolveRoot();
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return send(res, 400, 'Bad request');
    }
    if (rel.includes('\0') || rel.split('/').some((seg) => seg.startsWith('.') && seg !== '')) return send(res, 404, 'Not found');
    if (rel.endsWith('/')) rel += 'index.html';
    if (!base) {
      if (rel === '/index.html') return sendHtml(req, res, PLACEHOLDER_HTML);
      return send(res, 404, 'Not found');
    }
    let file = path.join(base, rel);
    let st;
    try {
      file = await fsp.realpath(file);
      if (file !== base && !file.startsWith(base + path.sep)) return send(res, 404, 'Not found');
      st = await fsp.stat(file);
      if (st.isDirectory()) {
        file = path.join(file, 'index.html');
        st = await fsp.stat(file);
      }
    } catch {
      if (rel === '/index.html') return sendHtml(req, res, PLACEHOLDER_HTML);
      return send(res, 404, 'Not found');
    }
    if (!st.isFile()) return send(res, 404, 'Not found');
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      ...(type.startsWith('text/html') ? securityHeaders : {}),
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return 304;
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return 200;
    }
    await new Promise((resolve) => {
      const stream = fs.createReadStream(file);
      stream.on('error', () => {
        res.destroy();
        resolve();
      });
      stream.on('end', resolve);
      stream.pipe(res);
    });
    return 200;
  }

  function sendHtml(req, res, html) {
    const body = Buffer.from(html);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff', ...securityHeaders });
    res.end(req.method === 'HEAD' ? undefined : body);
    return 200;
  }

  function send(res, status, text) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(text);
    return status;
  }

  return { serve };
}
