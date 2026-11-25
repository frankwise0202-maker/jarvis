// node --test: core/server/push. A local fake push service receives what the Core sends through web-push,
// checks the VAPID JWT (ES256, with the Core's public key) and decrypts the aes128gcm body with the
// subscription's own private key and auth secret (RFC 8291), so the whole path is real except the network.
// The decryptor is first checked against RFC 8291's own example.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createPush, buildPayload, generateVapidKeys, APP_URL, TTL_SEC, MAX_DEVICES } from '../../server/push/index.mjs';

const b64 = (b) => Buffer.from(b).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url');

// ---------------------------------------------------------------------------------------------- RFC 8291
function hkdf(salt, ikm, info, len) {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
}

/** Decrypt an aes128gcm Web Push message body (RFC 8291 + RFC 8188, one record). */
function decryptPush(body, { privateKey, publicKey, auth }) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);
  assert.equal(idlen, 65, 'the key id is the server\'s ephemeral public key');
  assert.ok(record.length <= rs, 'a single record');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateKey);
  const secret = ecdh.computeSecret(asPublic);
  const ikm = hkdf(auth, secret, Buffer.concat([Buffer.from('WebPush: info\0'), publicKey, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([d.update(record.subarray(0, record.length - 16)), d.final()]);
  let i = plain.length - 1;
  while (i >= 0 && plain[i] === 0) i -= 1;
  assert.equal(plain[i], 2, 'the last record ends with the 0x02 delimiter');
  return plain.subarray(0, i);
}

test("the test decryptor reproduces RFC 8291's example (section 5)", () => {
  const body = unb64('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  const plain = decryptPush(body, {
    privateKey: unb64('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'),
    publicKey: unb64('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
    auth: unb64('BTBZMqHH6r4Tts7J_aSIgg'),
  });
  assert.equal(plain.toString(), 'When I grow up, I want to be a watermelon');
});

// ---------------------------------------------------------------------------------------------- helpers
/** A browser's subscription: its own P-256 key pair and auth secret, at the fake push service. */
function browser(endpoint) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    privateKey: ecdh.getPrivateKey(),
    publicKey: ecdh.getPublicKey(),
    auth,
    subscription: { endpoint, keys: { p256dh: b64(ecdh.getPublicKey()), auth: b64(auth) } },
  };
}

/** The fake push service: records each POST; `reply(path)` picks the status (default 201). */
async function pushService(reply = () => 201) {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      const status = reply(req.url);
      if (status === 'hang') return; // never answers
      res.writeHead(status);
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, received, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

function verifyVapid(headers, { audience, vapidPublicKey }) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(headers.authorization ?? '');
  assert.ok(m, `VAPID authorization header: ${headers.authorization}`);
  assert.equal(m[2], vapidPublicKey, 'k= is the Core\'s public key');
  const [h, p, sig] = m[1].split('.');
  const header = JSON.parse(unb64(h).toString());
  const claims = JSON.parse(unb64(p).toString());
  assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });
  assert.equal(claims.aud, audience);
  assert.equal(claims.sub, APP_URL);
  const nowSec = Math.floor(Date.now() / 1000);
  assert.ok(claims.exp > nowSec && claims.exp <= nowSec + 24 * 3600, 'expires within 24 hours');
  const pub = unb64(vapidPublicKey);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64(pub.subarray(1, 33)), y: b64(pub.subarray(33)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, unb64(sig)), 'the JWT is signed by the Core\'s VAPID key');
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jcore-push-'));
}
const modeOf = (p) => (fs.statSync(p).mode & 0o777).toString(8);

// ---------------------------------------------------------------------------------------------- tests
test('VAPID keys: made on the first run with node:crypto, saved 600 in a 700 folder, the same after a restart', () => {
  const root = tmpDir();
  const dir = path.join(root, 'push');
  try {
    const logs = [];
    const a = createPush({ dir, log: (m) => logs.push(m), importWebPush: () => Promise.reject(new Error('not needed')) });
    const key = a.info().vapidPublicKey;
    assert.match(key, /^B[A-Za-z0-9_-]{86}$/, 'an uncompressed P-256 point, base64url');
    assert.equal(unb64(key).length, 65);
    assert.equal(modeOf(dir), '700');
    assert.equal(modeOf(path.join(dir, 'vapid.json')), '600');
    assert.deepEqual(a.info().devices, []);
    assert.ok(logs.some((l) => /made new VAPID keys/.test(l)));
    const b = createPush({ dir });
    assert.equal(b.info().vapidPublicKey, key);
    // a broken key file is moved aside and replaced; devices signed up with the old key must sign up again
    fs.writeFileSync(path.join(dir, 'vapid.json'), '{"publicKey": "nope"');
    const c = createPush({ dir, log: (m) => logs.push(m) });
    assert.notEqual(c.info().vapidPublicKey, key);
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('vapid.json.corrupt-')));
    // memory only (fixture mode)
    const d = createPush({ dir: null });
    assert.match(d.info().vapidPublicKey, /^B/);
    // generateVapidKeys is what web-push expects: 65-byte public, 32-byte private
    const k = generateVapidKeys();
    assert.equal(unb64(k.publicKey).length, 65);
    assert.equal(unb64(k.privateKey).length, 32);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('subscribe checks the subscription; the same endpoint keeps its id; unsubscribe removes it', async () => {
  const root = tmpDir();
  try {
    const push = createPush({ dir: path.join(root, 'push') });
    const good = browser('https://web.push.apple.com/QGuQyavXutnMH8KU2ckBRM0RbGfObwtedUEbz8e8a1PdCFRDb4v6L0RSW1e');
    const bad = [
      undefined,
      {},
      { subscription: { endpoint: 'http://web.push.apple.com/x', keys: good.subscription.keys } },
      { subscription: { endpoint: 'https://localhost/x', keys: good.subscription.keys } },
      { subscription: { endpoint: 'https://127.0.0.1/x', keys: good.subscription.keys } },
      { subscription: { endpoint: 'https://[::1]/x', keys: good.subscription.keys } },
      { subscription: { endpoint: 'https://alienware.tail4e5f6a.ts.net/x', keys: good.subscription.keys } },
      { subscription: { endpoint: 'https://printer.local/x', keys: good.subscription.keys } },
      { subscription: { endpoint: 'https://user:pw@fcm.googleapis.com/x', keys: good.subscription.keys } },
      { subscription: { endpoint: `https://fcm.googleapis.com/${'a'.repeat(3000)}`, keys: good.subscription.keys } },
      { subscription: { endpoint: 'not a url', keys: good.subscription.keys } },
      { subscription: { endpoint: good.subscription.endpoint, keys: { p256dh: b64(crypto.randomBytes(64)), auth: good.subscription.keys.auth } } },
      { subscription: { endpoint: good.subscription.endpoint, keys: { p256dh: b64(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)])), auth: good.subscription.keys.auth } } },
      { subscription: { endpoint: good.subscription.endpoint, keys: { p256dh: good.subscription.keys.p256dh, auth: b64(crypto.randomBytes(8)) } } },
      { subscription: { endpoint: good.subscription.endpoint, keys: { p256dh: good.subscription.keys.p256dh } } },
    ];
    for (const body of bad) {
      await assert.rejects(push.subscribe(body), (e) => e.status === 400 && e.code === 'bad_subscription' && e.expose === true, JSON.stringify(body)?.slice(0, 120));
    }
    const { id } = await push.subscribe({ subscription: good.subscription, label: '  Frank’s   iPhone ' });
    assert.match(id, /^p_[0-9a-f]{12}$/);
    const again = await push.subscribe({ subscription: good.subscription, label: 'iPhone' });
    assert.equal(again.id, id, 'the same endpoint is the same device');
    const chrome = browser('https://fcm.googleapis.com/fcm/send/dAbCdEf:APA91bH');
    await push.subscribe({ subscription: chrome.subscription });
    const info = push.info();
    assert.deepEqual(info.devices.map((d) => [d.label, Object.keys(d).sort().join(',')]), [['iPhone', 'addedAt,id,label'], ['Device', 'addedAt,id,label']]);
    assert.ok(!JSON.stringify(info).includes('apple.com'), 'endpoints are never handed out');
    assert.equal(modeOf(path.join(root, 'push', 'subscriptions.json')), '600');
    // a restart reads them back
    assert.equal(createPush({ dir: path.join(root, 'push') }).info().devices.length, 2);
    await assert.rejects(push.unsubscribe({}), (e) => e.code === 'bad_endpoint');
    assert.deepEqual(await push.unsubscribe({ endpoint: good.subscription.endpoint }), { removed: true });
    assert.deepEqual(await push.unsubscribe({ endpoint: good.subscription.endpoint }), { removed: false });
    assert.deepEqual(push.info().devices.map((d) => d.label), ['Device']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('notify: encrypted with aes128gcm for each device, VAPID-signed, TTL 24 h; the fake service decrypts the exact payload', async () => {
  const svc = await pushService();
  const root = tmpDir();
  try {
    const push = createPush({ dir: path.join(root, 'push'), allowInsecure: true });
    const phone = browser(`${svc.origin}/push/iphone`);
    const mac = browser(`${svc.origin}/push/mac`);
    await push.subscribe({ subscription: phone.subscription, label: 'iPhone' });
    await push.subscribe({ subscription: mac.subscription, label: 'Mac' });
    const payload = { title: 'Research finished', body: 'LG 27GP850: three good deals under $300.', url: `${APP_URL}?homebase=job:j_abc123`, tag: 'job:j_abc123' };
    const r = await push.notify(payload);
    assert.deepEqual(r, { sent: 2, failed: 0, dropped: 0 });
    assert.equal(svc.received.length, 2);
    for (const msg of svc.received) {
      const who = msg.path === '/push/iphone' ? phone : mac;
      assert.equal(msg.headers['content-encoding'], 'aes128gcm');
      assert.equal(msg.headers.ttl, String(TTL_SEC));
      assert.equal(msg.headers.urgency, 'high');
      assert.equal(msg.headers['content-type'], 'application/octet-stream');
      verifyVapid(msg.headers, { audience: svc.origin, vapidPublicKey: push.info().vapidPublicKey });
      assert.ok(!msg.body.includes(Buffer.from('Research finished')), 'the payload is not readable on the wire');
      const plain = decryptPush(msg.body, who);
      assert.deepEqual(JSON.parse(plain.toString()), payload);
    }
    // each message has its own salt and ephemeral key
    assert.notDeepEqual(svc.received[0].body.subarray(0, 86), svc.received[1].body.subarray(0, 86));
  } finally {
    await svc.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('expired subscriptions (404, 410) are dropped; other failures are counted and kept; nothing throws', async () => {
  const svc = await pushService((p) => ({ '/gone': 410, '/missing': 404, '/broken': 500, '/ok': 201, '/slow': 'hang' }[p] ?? 201));
  const root = tmpDir();
  const logs = [];
  try {
    const push = createPush({ dir: path.join(root, 'push'), allowInsecure: true, timeoutMs: 300, log: (m) => logs.push(m) });
    for (const p of ['gone', 'missing', 'broken', 'ok', 'slow']) await push.subscribe({ subscription: browser(`${svc.origin}/${p}`).subscription, label: p });
    // and one whose push service is not even there (connection refused)
    const closed = await pushService();
    await closed.close();
    await push.subscribe({ subscription: browser(`${closed.origin}/x`).subscription, label: 'offline' });
    const t0 = Date.now();
    const r = await push.notify({ title: 'Morning briefing', body: 'Good morning.', url: `${APP_URL}?homebase=briefing`, tag: 'briefing' });
    assert.ok(Date.now() - t0 < 5000, 'a hanging push service does not hold things up');
    assert.deepEqual(r, { sent: 1, failed: 5, dropped: 2 });
    assert.deepEqual(push.info().devices.map((d) => d.label).sort(), ['broken', 'offline', 'ok', 'slow']);
    assert.equal(createPush({ dir: path.join(root, 'push') , allowInsecure: true }).info().devices.length, 4, 'the drop was saved');
    assert.ok(logs.some((l) => /expired \(410 from 127\.0\.0\.1/.test(l)));
    assert.ok(!logs.some((l) => l.includes('/gone')), 'endpoint paths (capability URLs) are never logged');
    // the test button: only the given device, or all of them
    svc.received.length = 0;
    assert.deepEqual(await push.test({ endpoint: `${svc.origin}/ok` }), { sent: 1, failed: 0 });
    assert.equal(svc.received.length, 1);
    await assert.rejects(push.test({ endpoint: `${svc.origin}/nobody` }), (e) => e.status === 404 && e.code === 'unknown_device');
    const all = await push.test();
    assert.equal(all.sent + all.failed, 4);
  } finally {
    await svc.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('without web-push installed: the key and devices still show, notify reports it and never throws', async () => {
  const root = tmpDir();
  const logs = [];
  try {
    const push = createPush({ dir: path.join(root, 'push'), allowInsecure: true, log: (m) => logs.push(m), importWebPush: () => Promise.reject(Object.assign(new Error("Cannot find package 'web-push'"), { code: 'ERR_MODULE_NOT_FOUND' })) });
    await push.subscribe({ subscription: browser('http://127.0.0.1:9/x').subscription, label: 'iPhone' });
    assert.match(push.info().vapidPublicKey, /^B/);
    assert.equal(await push.available(), false);
    assert.deepEqual(await push.notify({ title: 'x' }), { sent: 0, failed: 1, dropped: 0, error: 'web_push_missing' });
    assert.deepEqual(await push.test(), { sent: 0, failed: 1 });
    assert.equal(logs.filter((l) => /web-push library isn't installed/.test(l)).length, 1, 'said once');
    // no devices: nothing to do, even without the library
    const empty = createPush({ dir: null, importWebPush: () => Promise.reject(new Error('missing')) });
    assert.deepEqual(await empty.notify({ title: 'x' }), { sent: 0, failed: 0, dropped: 0 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the real web-push loads lazily from core/node_modules when it is installed', async (t) => {
  const push = createPush({ dir: null });
  let has = true;
  try {
    await import('web-push');
  } catch {
    has = false;
  }
  if (!has) return t.skip('core/node_modules has no web-push here');
  assert.equal(await push.available(), true);
});

test('payload: title, body, url and tag cleaned and kept small; only the app\'s own address opens', () => {
  const p = (x) => JSON.parse(buildPayload(x));
  assert.deepEqual(p({ title: 'Hi', body: 'There', url: `${APP_URL}?homebase=watch:w_1`, tag: 'watch:w_1' }), { title: 'Hi', body: 'There', url: `${APP_URL}?homebase=watch:w_1`, tag: 'watch:w_1' });
  assert.deepEqual(p({}), { title: 'Jarvis', body: '', url: APP_URL, tag: 'jarvis' });
  assert.equal(p({ url: 'https://evil.example/?homebase=briefing' }).url, APP_URL);
  assert.equal(p({ url: 'javascript:alert(1)' }).url, APP_URL);
  assert.equal(p({ url: `${APP_URL}?x="><script>` }).url, APP_URL);
  assert.equal(p({ title: 'a\u0000b\u202ec\n d' }).title, 'abc d');
  assert.equal(p({ body: 'line one\r\nline two\n\n\n\nline three' }).body, 'line one\nline two\n\nline three');
  const long = p({ title: 'T'.repeat(500), body: '日本語のテキスト'.repeat(400), tag: 'x'.repeat(100) });
  assert.equal([...long.title].length, 120);
  assert.ok(long.title.endsWith('…'));
  assert.equal(long.tag.length, 64);
  assert.ok(Buffer.byteLength(buildPayload({ title: 'T'.repeat(500), body: '日本語のテキスト'.repeat(400), url: `${APP_URL}?homebase=job:${'j'.repeat(400)}` })) <= 3000);
});

test(`at most ${MAX_DEVICES} devices: the oldest makes room`, async () => {
  let t = Date.parse('2026-11-25T00:00:00Z');
  const push = createPush({ dir: null, now: () => (t += 1000) });
  const first = await push.subscribe({ subscription: browser('https://fcm.googleapis.com/fcm/send/first').subscription, label: 'first' });
  for (let i = 0; i < MAX_DEVICES; i += 1) await push.subscribe({ subscription: browser(`https://fcm.googleapis.com/fcm/send/n${i}`).subscription, label: `n${i}` });
  const ids = push.info().devices.map((d) => d.id);
  assert.equal(ids.length, MAX_DEVICES);
  assert.ok(!ids.includes(first.id));
});
