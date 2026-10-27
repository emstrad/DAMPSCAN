/**
 * Phone notifications to the installed staff app (lib/webpush.js, lib/push.js).
 *
 * The push services are never called: fetch is replaced and every request is
 * kept, then opened the way a phone would open it. That proves the payload
 * encryption and the VAPID signature against the standards rather than
 * against our own encoder, and that each person hears only about their own
 * businesses, that a dead subscription is forgotten, and that with no keys
 * nothing happens at all.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createECDH, createHmac, createDecipheriv, createPublicKey, verify } from 'node:crypto';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'push-test-secret-long-enough-xxxxxxxx';
process.env.IP_SALT = 'push-test-salt-long-enough';
delete process.env.NTFY_TOPIC;

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const { generateVapidKeys, vapidConfig, encryptPayload, vapidAuth } = await import('../lib/webpush.js');
const { pushToStaff, saveSubscription } = await import('../lib/push.js');
const { notify } = await import('../lib/notify.js');
const pushRoute = (await import('../lib/routes/admin/push.js')).default;
const { scopeFor } = await import('../lib/access.js');

const KEYS = generateVapidKeys();
const setKeys = () => Object.assign(process.env, { VAPID_PUBLIC_KEY: KEYS.publicKey, VAPID_PRIVATE_KEY: KEYS.privateKey, VAPID_SUBJECT: 'mailto:owner@example.com' });
const clearKeys = () => { delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT; };

/** A phone: its own key pair and auth secret, and the ability to read a push. */
function phone(name) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = Buffer.from(name.padEnd(16, '!').slice(0, 16));
  return {
    sub: { endpoint: `https://push.example.com/${name}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } },
    /* RFC 8291, the receiving side. */
    open(body) {
      const salt = body.subarray(0, 16);
      const idlen = body[20];
      const asPublic = body.subarray(21, 21 + idlen);
      const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
      const secret = ecdh.computeSecret(asPublic);
      const ikm = hmac(hmac(auth, secret), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
      const prk = hmac(salt, ikm);
      const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
      const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
      const data = body.subarray(21 + idlen);
      const d = createDecipheriv('aes-128-gcm', cek, nonce);
      d.setAuthTag(data.subarray(data.length - 16));
      const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
      assert.equal(plain[plain.length - 1], 2, 'last record delimiter');
      return JSON.parse(plain.subarray(0, -1).toString());
    }
  };
}

let sent = [];
let answer = () => 201;
const realFetch = globalThis.fetch;
before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return new Response(null, { status: answer(url) }); };
});
beforeEach(async () => {
  sent = [];
  answer = () => 201;
  clearKeys();
  await pool.query('truncate people, push_subscriptions, notifications restart identity cascade');
});
after(async () => { globalThis.fetch = realFetch; await pool.end(); });

async function person(name, grants) {
  const { rows } = await pool.query("insert into people (name, passcode_hash) values ($1, 'x') returning id", [name]);
  for (const g of grants) await pool.query("insert into grants (person_id, business_slug, level) values ($1, $2, 'work')", [rows[0].id, g]);
  return scopeFor({ person: true, sub: Number(rows[0].id) });
}

test('the payload opens on the phone and the VAPID token verifies against the public key', () => {
  setKeys();
  const p = phone('alpha');
  assert.deepEqual(p.open(encryptPayload(JSON.stringify({ title: 'Hi £5' }), p.sub.keys)), { title: 'Hi £5' });

  const header = vapidAuth(p.sub.endpoint, vapidConfig());
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, KEYS.publicKey);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.aud, 'https://push.example.com');
  assert.equal(claims.sub, 'mailto:owner@example.com');
  const pub = Buffer.from(KEYS.publicKey, 'base64url');
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('with no keys nothing is sent and the button is hidden', async () => {
  const me = await person('Ann', ['roofing']);
  await pool.query("insert into push_subscriptions (person_id, endpoint, keys) values ($1, 'https://push.example.com/x', '{}')", [me.personId]);
  assert.deepEqual(await pushToStaff({ business: 'roofing', title: 't', message: 'm' }), { sent: 0, removed: 0 });
  assert.equal(sent.length, 0);
  const res = { statusCode: 200, body: '', setHeader() {}, end(b) { this.body += b || ''; } };
  await pushRoute({ method: 'GET', url: '/api/admin/push', headers: {}, mcpScope: me }, res);
  assert.equal(JSON.parse(res.body).publicKey, null);
});

test('each person hears only about their businesses, the owners hear everything, and a dead phone is forgotten', async () => {
  setKeys();
  const roofer = await person('Rob', ['roofing']);
  const cooler = await person('Cat', ['ac']);
  const gone = await person('Gus', ['roofing']);
  await pool.query('update people set active = false where id = $1', [gone.personId]);
  const owners = await scopeFor({ person: false, name: 'Owners' });
  const phones = { rob: phone('rob'), cat: phone('cat'), gus: phone('gus'), own: phone('own') };
  assert.ok(await saveSubscription(roofer, phones.rob.sub));
  assert.ok(await saveSubscription(cooler, phones.cat.sub));
  assert.ok(await saveSubscription(gone, phones.gus.sub));
  assert.ok(await saveSubscription(owners, phones.own.sub));
  assert.equal(await saveSubscription(roofer, { endpoint: 'http://insecure.example', keys: phones.rob.sub.keys }), false);

  answer = (url) => (String(url).endsWith('/own') ? 410 : 201);
  const r = await pushToStaff({ business: 'roofing', title: 'New enquiry: Verge Roofing', message: 'Sarah in BR6 needs help with flat roof.' });
  assert.deepEqual(sent.map((s) => s.url).sort(), ['https://push.example.com/own', 'https://push.example.com/rob']);
  assert.deepEqual(r, { sent: 1, removed: 1 });
  const robs = sent.find((s) => s.url.endsWith('/rob'));
  assert.equal(robs.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(phones.rob.open(Buffer.from(robs.init.body)).title, 'New enquiry: Verge Roofing');
  assert.deepEqual((await pool.query('select endpoint from push_subscriptions order by id')).rows.map((x) => x.endpoint.split('/').pop()), ['rob', 'cat', 'gus'], 'the 410 phone is gone');
});

test('ratings and accepted quotes buzz the phone through notify; routine changes do not', async () => {
  setKeys();
  const roofer = await person('Rob', ['roofing']);
  const p = phone('rob');
  await saveSubscription(roofer, p.sub);
  await notify({ business: 'roofing', kind: 'payment', ref: 1, title: 'paid', message: 'x' });
  assert.equal(sent.length, 0);
  await notify({ business: 'roofing', kind: 'rating_low', ref: 7, title: 'Verge Roofing: 2 stars', message: 'Job #7 was rated 2 out of 5.' });
  await notify({ business: 'roofing', kind: 'quote_accepted', ref: 8, title: 'Verge Roofing: quote accepted', message: 'Job #8.' });
  assert.deepEqual(sent.map((s) => p.open(Buffer.from(s.init.body)).title), ['Verge Roofing: 2 stars', 'Verge Roofing: quote accepted']);
});

test('the route keeps a subscription for the signed-in person and forgets it again', async () => {
  setKeys();
  const me = await person('Ann', ['roofing']);
  const p = phone('ann');
  const call = async (method, body) => {
    const res = { statusCode: 200, body: '', setHeader() {}, end(b) { this.body += b || ''; } };
    await pushRoute({ method, url: '/api/admin/push', headers: {}, body, mcpScope: me }, res);
    return { status: res.statusCode, data: JSON.parse(res.body) };
  };
  assert.equal((await call('GET')).data.publicKey, KEYS.publicKey);
  assert.equal((await call('POST', { subscription: p.sub })).status, 200);
  assert.equal(Number((await pool.query('select person_id from push_subscriptions')).rows[0].person_id), me.personId);
  /* Settings lists whose phones have the app on. */
  assert.deepEqual((await call('GET')).data.phones, [{ name: 'Ann', phones: 1 }]);
  assert.equal((await call('POST', { subscription: { endpoint: 'nope' } })).status, 400);
  assert.equal((await call('DELETE', { endpoint: p.sub.endpoint })).status, 200);
  assert.equal((await pool.query('select count(*) from push_subscriptions')).rows[0].count, '0');
});
