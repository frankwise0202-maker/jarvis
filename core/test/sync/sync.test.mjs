// node --test: core/server/sync (PUT/GET of device backups), through a real HTTP server wired the way
// server.mjs wires it, with real streams, gzip, aborted uploads and day changes from an injected clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createSync, acceptsGzip, cleanLabel, validDeviceId, MAX_BYTES } from '../../server/sync/index.mjs';

const ID = 'iphone-0123abcd';
const ID2 = 'mac-chrome-98765432';
const backup = (extra = {}) => JSON.stringify({ app: 'jarvis', version: 1, exportedAt: '2026-11-25T06:00:00.000Z', settings: { ownerName: 'Frank' }, memory: [], conversations: [{ id: 'c1', title: 'Hello', updatedAt: 1 }], ...extra });

function mode(p) {
  return (fs.statSync(p).mode & 0o777).toString(8);
}

async function setup(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jcore-sync-'));
  const dir = path.join(root, 'data', 'sync');
  const clock = { t: Date.parse('2026-11-25T12:00:00') };
  const logs = [];
  const sync = createSync({ dir, now: () => clock.t, minFreeBytes: 0, log: (m) => logs.push(m), ...opts });
  // the wiring server.mjs uses (notes/io-interfaces.md)
  const server = http.createServer(async (req, res) => {
    const send = (status, body, headers = {}) => {
      const buf = Buffer.from(JSON.stringify(body));
      res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': buf.length, ...headers });
      res.end(buf);
    };
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/api/sync' && req.method === 'GET') return send(200, sync.list());
      const m = /^\/api\/sync\/([^/]+)$/.exec(url.pathname);
      if (m && req.method === 'PUT') {
        return send(200, await sync.put(m[1], req, { label: req.headers['x-jarvis-device-label'], encoding: req.headers['content-encoding'] }));
      }
      if (m && (req.method === 'GET' || req.method === 'HEAD')) {
        const got = await sync.get(m[1], { acceptEncoding: req.headers['accept-encoding'] });
        if (!got) return send(404, { error: 'not_found' });
        const headers = { 'Content-Type': got.contentType, Vary: 'Accept-Encoding' };
        if (got.contentEncoding) headers['Content-Encoding'] = got.contentEncoding;
        if (got.bytes !== null) headers['Content-Length'] = got.bytes;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') {
          got.stream.destroy();
          return res.end();
        }
        return got.stream.pipe(res);
      }
      return send(404, { error: 'not_found' });
    } catch (err) {
      if (err?.expose) return send(err.status, { error: err.code, message: err.message }, err.headers);
      return send(500, { error: 'internal', message: String(err?.stack ?? err) });
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    root, dir, clock, logs, sync, base,
    put: (id, body, headers = {}) => fetch(`${base}/api/sync/${id}`, { method: 'PUT', body, headers: { 'Content-Type': 'application/json', ...headers } }),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }).then(() => fs.rmSync(root, { recursive: true, force: true })),
  };
}

test('helpers: device ids, labels, Accept-Encoding', () => {
  for (const ok of ['abcdefgh', ID, 'a'.repeat(64), '12345678', 'a-b-c-d-e']) assert.ok(validDeviceId(ok), ok);
  for (const bad of ['abcdefg', 'a'.repeat(65), 'ABCDEFGH', '../../etc', '..%2f..%2fetc', 'abcd/efgh', 'abcd.efgh', 'abcdefgh\n', ' abcdefgh', '', null, 12345678]) assert.ok(!validDeviceId(bad), String(bad));
  assert.equal(cleanLabel('iPhone'), 'iPhone');
  assert.equal(cleanLabel(encodeURIComponent('Frank’s iPhone')), 'Frank’s iPhone');
  assert.equal(cleanLabel('  Mac\u0000 \u202eChrome  '), 'Mac Chrome');
  assert.equal(cleanLabel('x'.repeat(200)).length, 60);
  assert.equal(cleanLabel('   '), null);
  assert.equal(cleanLabel(undefined), null);
  assert.equal(cleanLabel('100%'), '100%', 'a lone % is not decoded');
  assert.equal(acceptsGzip(undefined), true);
  assert.equal(acceptsGzip('gzip, deflate, br'), true);
  assert.equal(acceptsGzip('br;q=1.0, gzip;q=0.8, *;q=0.1'), true);
  assert.equal(acceptsGzip('identity'), false);
  assert.equal(acceptsGzip(''), false);
  assert.equal(acceptsGzip('gzip;q=0'), false);
  assert.equal(acceptsGzip('*'), true);
  assert.equal(acceptsGzip('*;q=0, deflate'), false);
});

test('PUT stores a backup (folder 700, files 600), GET gives it back gzip or plain, the list shows it', async () => {
  const s = await setup();
  try {
    const body = backup();
    const r = await s.put(ID, body, { 'X-Jarvis-Device-Label': encodeURIComponent('Frank’s iPhone') });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j, { ok: true, bytes: Buffer.byteLength(body), storedAt: new Date(s.clock.t).toISOString() });
    assert.equal(mode(s.dir), '700');
    assert.equal(mode(path.join(s.dir, ID)), '700');
    assert.equal(mode(path.join(s.dir, ID, 'latest.json.gz')), '600');
    assert.equal(mode(path.join(s.dir, ID, 'meta.json')), '600');
    assert.equal(mode(path.join(s.dir, ID, 'daily')), '700');
    assert.equal(zlib.gunzipSync(fs.readFileSync(path.join(s.dir, ID, 'latest.json.gz'))).toString(), body, 'stored compressed, byte for byte');
    // fetch asks for gzip and unpacks it
    let g = await fetch(`${s.base}/api/sync/${ID}`);
    assert.equal(g.status, 200);
    assert.equal(g.headers.get('content-encoding'), 'gzip');
    assert.equal(await g.text(), body);
    // a client without gzip gets plain JSON, chunked
    g = await new Promise((resolve, reject) => {
      http.get(`${s.base}/api/sync/${ID}`, { headers: { 'Accept-Encoding': 'identity' } }, (res) => {
        let t = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (t += d)).on('end', () => resolve({ res, t }));
      }).on('error', reject);
    });
    assert.equal(g.res.headers['content-encoding'], undefined);
    assert.equal(g.t, body);
    const list = await (await fetch(`${s.base}/api/sync`)).json();
    assert.deepEqual(list, { devices: [{ id: ID, label: 'Frank’s iPhone', updatedAt: new Date(s.clock.t).toISOString(), bytes: Buffer.byteLength(body) }] });
    // unknown device: 404
    assert.equal((await fetch(`${s.base}/api/sync/abcdefgh-0000`)).status, 404);
  } finally {
    await s.close();
  }
});

test('a gzip upload is unpacked on the way in; a broken gzip or another encoding is refused', async () => {
  const s = await setup();
  try {
    const body = backup({ note: 'é ü 日本 '.repeat(2000) });
    let r = await s.put(ID, zlib.gzipSync(body), { 'Content-Encoding': 'gzip' });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await r.json()).bytes, Buffer.byteLength(body));
    assert.equal(await (await fetch(`${s.base}/api/sync/${ID}`)).text(), body);
    r = await s.put(ID2, Buffer.from('not gzip at all'), { 'Content-Encoding': 'gzip' });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'bad_gzip');
    r = await s.put(ID2, zlib.gzipSync(body).subarray(0, 200), { 'Content-Encoding': 'gzip' });
    assert.equal(r.status, 400, 'a gzip cut short');
    assert.equal((await r.json()).error, 'bad_gzip');
    r = await s.put(ID2, body, { 'Content-Encoding': 'br' });
    assert.equal(r.status, 415);
    assert.equal((await r.json()).error, 'unsupported_encoding');
    assert.deepEqual(s.sync.list().devices.map((d) => d.id), [ID]);
    assert.ok(!fs.existsSync(path.join(s.dir, ID2, 'latest.json.gz')));
  } finally {
    await s.close();
  }
});

test('device ids are checked before any path is built (no traversal)', async () => {
  const s = await setup();
  try {
    for (const id of ['short', 'ABCDEFGHIJ', '..%2F..%2Fescape', '%2e%2e%2f%2e%2e%2fescape', 'a'.repeat(65), 'abc.defgh', 'abcdefg%00h']) {
      const r = await s.put(id, backup());
      assert.equal(r.status, 400, id);
      assert.equal((await r.json()).error, 'bad_device', id);
      const g = await fetch(`${s.base}/api/sync/${id}`);
      assert.equal(g.status, 400, id);
    }
    await assert.rejects(s.sync.put('../escape-me', { headers: {}, resume() {} }), (e) => e.code === 'bad_device');
    await assert.rejects(s.sync.get('../../../etc/passwd'), (e) => e.code === 'bad_device');
    assert.deepEqual(fs.readdirSync(s.dir), [], 'nothing was created');
    assert.deepEqual(fs.readdirSync(path.dirname(s.dir)), ['sync'], 'nothing next to it either');
  } finally {
    await s.close();
  }
});

test('size limit: 50 MB declared is refused at once; a stream (or a gzip bomb) past the limit is cut off', async () => {
  const s = await setup();
  try {
    // declared too large: refused before reading
    const r1 = await new Promise((resolve, reject) => {
      const req = http.request(`${s.base}/api/sync/${ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': MAX_BYTES + 1 } }, (res) => {
        let t = '';
        res.on('data', (d) => (t += d)).on('end', () => {
          resolve({ status: res.statusCode, body: JSON.parse(t) });
          req.destroy();
        });
      });
      req.on('error', reject);
      req.write('{"app":"jarvis"');
      // never sends the rest; the reply comes anyway
    });
    assert.equal(r1.status, 413);
    assert.equal(r1.body.error, 'too_large');
    // a gzip bomb: 60 MB of spaces packed into a few kilobytes, with the default 50 MB limit
    const bomb = zlib.gzipSync(Buffer.concat([Buffer.from('{"app":"jarvis","x":"'), Buffer.alloc(60 * 1024 * 1024, 0x61), Buffer.from('"}')]));
    assert.ok(bomb.length < 1024 * 1024);
    const r2 = await s.put(ID, bomb, { 'Content-Encoding': 'gzip' });
    assert.equal(r2.status, 413);
    assert.match((await r2.json()).message, /once unpacked/);
    assert.equal(s.sync.list().devices.length, 0);
    assert.deepEqual(fs.readdirSync(path.join(s.dir, ID)), [], 'the temporary file is gone');
  } finally {
    await s.close();
  }
  // a chunked upload (no Content-Length) past a small limit
  const t = await setup({ maxBytes: 64 * 1024 });
  try {
    const big = backup({ pad: 'x'.repeat(100 * 1024) });
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const r = await fetch(`${t.base}/api/sync/${ID}`, { method: 'PUT', body: stream, duplex: 'half', headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 413);
    assert.equal(t.sync.list().devices.length, 0);
  } finally {
    await t.close();
  }
});

test('only a Jarvis backup is kept, and never one with an API key in it; the previous backup stays', async () => {
  const s = await setup();
  try {
    const good = backup();
    assert.equal((await s.put(ID, good)).status, 200);
    for (const bad of ['{"foo":1}', '[1,2,3]', 'hello', '', '{"app":"jarvis","conversations":[', '{"app":"other"}']) {
      const r = await s.put(ID, bad);
      assert.equal(r.status, 400, bad);
      assert.equal((await r.json()).error, 'bad_backup', bad);
    }
    const withKey = backup({ memory: [{ id: 'm', text: 'my key is sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' }] });
    let r = await s.put(ID, withKey);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'key_in_backup');
    // the key split across two chunks of a gzip stream is still caught
    const pad = 'a'.repeat(70_000);
    r = await s.put(ID, zlib.gzipSync(backup({ pad, memory: [{ text: 'SK-ANT-' + 'Z'.repeat(30) }] })), { 'Content-Encoding': 'gzip' });
    assert.equal((await r.json()).error, 'key_in_backup');
    assert.equal(await (await fetch(`${s.base}/api/sync/${ID}`)).text(), good, 'the last good backup is untouched');
    assert.deepEqual(fs.readdirSync(path.join(s.dir, ID)).sort(), ['daily', 'latest.json.gz', 'meta.json']);
    const onDisk = fs.readdirSync(path.join(s.dir, ID, 'daily')).map((f) => zlib.gunzipSync(fs.readFileSync(path.join(s.dir, ID, 'daily', f))).toString());
    assert.ok(onDisk.every((t) => !/sk-ant-/i.test(t)));
  } finally {
    await s.close();
  }
});

test('an upload cut off half way leaves nothing behind and keeps the previous backup', async () => {
  const s = await setup();
  try {
    const good = backup();
    assert.equal((await s.put(ID, good)).status, 200);
    await new Promise((resolve) => {
      const req = http.request(`${s.base}/api/sync/${ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': 100_000 } });
      req.on('error', () => resolve());
      req.write(`{"app":"jarvis","x":"${'y'.repeat(30_000)}`);
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 150);
    });
    // give the server a moment to notice
    for (let i = 0; i < 50 && fs.readdirSync(path.join(s.dir, ID)).some((f) => f.startsWith('.upload-')); i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(fs.readdirSync(path.join(s.dir, ID)).sort(), ['daily', 'latest.json.gz', 'meta.json']);
    assert.equal(await (await fetch(`${s.base}/api/sync/${ID}`)).text(), good);
    // and the device can upload again right away (not stuck as "busy")
    assert.equal((await s.put(ID, backup({ v: 2 }))).status, 200);
  } finally {
    await s.close();
  }
});

test('an upload that stops sending is dropped after the idle limit', async () => {
  const s = await setup({ idleMs: 200 });
  try {
    const r = await new Promise((resolve, reject) => {
      const req = http.request(`${s.base}/api/sync/${ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': 10_000 } }, (res) => {
        let t = '';
        res.on('data', (d) => (t += d)).on('end', () => {
          resolve({ status: res.statusCode, body: JSON.parse(t) });
          req.destroy();
        });
      });
      req.on('error', reject);
      req.write('{"app":"jarvis"');
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'incomplete');
    assert.equal(s.sync.list().devices.length, 0);
  } finally {
    await s.close();
  }
});

test('atomic replace: a download that started keeps reading the version it opened', async () => {
  const s = await setup();
  try {
    const v1 = backup({ pad: 'one'.repeat(200_000) });
    const v2 = backup({ pad: 'two'.repeat(200_000) });
    assert.equal((await s.put(ID, v1)).status, 200);
    const got = await s.sync.get(ID, { acceptEncoding: 'identity' });
    assert.equal((await s.put(ID, v2)).status, 200);
    let text = '';
    for await (const chunk of got.stream) text += chunk;
    assert.equal(text, v1);
    assert.equal(await (await fetch(`${s.base}/api/sync/${ID}`)).text(), v2);
  } finally {
    await s.close();
  }
});

test('one upload per device at a time; others are not blocked', async () => {
  const s = await setup();
  try {
    let release;
    const slow = new Promise((resolve, reject) => {
      const req = http.request(`${s.base}/api/sync/${ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(backup()) } }, (res) => {
        let t = '';
        res.on('data', (d) => (t += d)).on('end', () => resolve({ status: res.statusCode, body: JSON.parse(t) }));
      });
      req.on('error', reject);
      const body = backup();
      req.write(body.slice(0, 10));
      release = () => req.end(body.slice(10));
    });
    await new Promise((r) => setTimeout(r, 100));
    const second = await s.put(ID, backup());
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, 'busy');
    assert.equal((await s.put(ID2, backup())).status, 200, 'another device uploads meanwhile');
    release();
    assert.equal((await slow).status, 200);
  } finally {
    await s.close();
  }
});

test('daily snapshots: the last backup of each day, the newest 14 days kept, the latest always there', async () => {
  const s = await setup();
  try {
    const day0 = Date.parse('2026-11-01T09:00:00');
    for (let d = 0; d < 17; d += 1) {
      s.clock.t = day0 + d * 86_400_000;
      assert.equal((await s.put(ID, backup({ day: d, run: 'morning' }))).status, 200);
      s.clock.t += 8 * 3_600_000; // the same day, later
      assert.equal((await s.put(ID, backup({ day: d, run: 'evening' }))).status, 200);
    }
    const daily = fs.readdirSync(path.join(s.dir, ID, 'daily')).sort();
    assert.equal(daily.length, 14);
    assert.equal(daily[0], '2026-11-04.json.gz');
    assert.equal(daily[13], '2026-11-17.json.gz');
    for (const f of daily) assert.equal(mode(path.join(s.dir, ID, 'daily', f)), '600');
    const read = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
    assert.deepEqual([read(path.join(s.dir, ID, 'daily', daily[0])).day, read(path.join(s.dir, ID, 'daily', daily[0])).run], [3, 'evening'], 'the last one of that day');
    assert.equal(read(path.join(s.dir, ID, 'latest.json.gz')).day, 16);
    assert.equal(read(path.join(s.dir, ID, 'daily', daily[13])).run, 'evening');
    // a device that goes quiet keeps its last 14 snapshots (they are counted, not aged out)
    const t = await setup({ dir: s.dir, now: () => Date.parse('2027-03-01T10:00:00') });
    try {
      assert.equal((await t.put(ID2, backup())).status, 200);
      assert.equal(fs.readdirSync(path.join(s.dir, ID, 'daily')).length, 14);
    } finally {
      await t.close();
    }
  } finally {
    await s.close();
  }
});

test('a restart reads the index back and clears uploads it cut off', async () => {
  const s = await setup();
  try {
    assert.equal((await s.put(ID, backup(), { 'X-Jarvis-Device-Label': 'iPhone' })).status, 200);
    s.clock.t += 60_000;
    assert.equal((await s.put(ID2, backup(), { 'X-Jarvis-Device-Label': 'Mac' })).status, 200);
    fs.writeFileSync(path.join(s.dir, ID, '.upload-deadbeef.tmp'), 'half');
    fs.writeFileSync(path.join(s.dir, ID, 'daily', '.link-deadbeef'), 'half');
    fs.mkdirSync(path.join(s.dir, 'not-a-device!'));
    // a device whose description was lost: rebuilt from the file
    fs.rmSync(path.join(s.dir, ID2, 'meta.json'));
    const again = createSync({ dir: s.dir, minFreeBytes: 0 });
    const list = again.list().devices;
    assert.deepEqual(list.map((d) => d.id).sort(), [ID, ID2].sort());
    assert.equal(list.find((d) => d.id === ID).label, 'iPhone');
    assert.equal(list.find((d) => d.id === ID2).label, 'Device');
    assert.ok(!fs.existsSync(path.join(s.dir, ID, '.upload-deadbeef.tmp')));
    assert.ok(!fs.existsSync(path.join(s.dir, ID, 'daily', '.link-deadbeef')));
    // a label sent later replaces it; no label keeps the one there is
    assert.equal((await s.put(ID, backup())).status, 200);
    assert.equal(s.sync.list().devices.find((d) => d.id === ID).label, 'iPhone');
  } finally {
    await s.close();
  }
});

test('a nearly full drive refuses the upload instead of filling it', async () => {
  const s = await setup({ minFreeBytes: Number.MAX_SAFE_INTEGER });
  try {
    const r = await s.put(ID, backup());
    assert.equal(r.status, 507);
    assert.equal((await r.json()).error, 'disk_full');
  } finally {
    await s.close();
  }
});
