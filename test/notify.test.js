/**
 * Pushes to the owner's phone, and the morning digest.
 *
 * ntfy is a stubbed fetch, so every push body is read back and checked for
 * the one rule that matters: a business, a job number, an amount, a member
 * of staff, and never a customer. The rows land whether or not a push goes.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'notify-test-secret-long-enough-xxxx';
process.env.IP_SALT = 'notify-test-salt';
process.env.STAFF_ACCESS_CODE = '1290';
process.env.CRON_SECRET = 'a-cron-secret-that-is-long-enough';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

/* ntfy, stubbed: every publish is kept, and it can be told to fail. */
let pushes = [];
let ntfyDown = false;
globalThis.fetch = async (url, init) => {
  if (ntfyDown) throw new Error('ntfy unreachable');
  pushes.push({ url, headers: init.headers, body: JSON.parse(init.body) });
  return { ok: true, status: 200 };
};

const login = (await import('../lib/routes/auth/login.js')).default;
const quoted = (await import('../lib/routes/admin/quoted.js')).default;
const digest = (await import('../api/cron/digest.js')).default;

const P = (pounds) => Math.round(pounds * 100);
function makeReq({ method = 'POST', url = '/api/admin/quoted', body, headers = {} } = {}) {
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.7', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.7' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { this.body = p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const req = makeReq(init); const res = makeRes(); await handler(req, res); return res; }
async function scott() {
  const h = await hash('scott-code', { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,true) returning id', ['Scott', h]);
  await pool.query('insert into grants (person_id, business_slug, level) values ($1, $2, $3)', [rows[0].id, 'roofing', 'manage']);
  const res = await call(login, { url: '/api/auth/login', body: { code: 'scott-code' } });
  const raw = res.getHeader('set-cookie');
  return { id: Number(rows[0].id), cookie: (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0] };
}
const post = (cookie, body) => call(quoted, { body, headers: { cookie } });
const rows = async () => (await pool.query('select business_slug, kind, ref, title, message, push_sent_at, digest_sent_at from notifications order by id')).rows;
const CUSTOMER = 'Priya Sharma';

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, job_costs, job_owner_days, job_payments, payouts, notifications restart identity cascade');
  pushes = [];
  ntfyDown = false;
  process.env.NTFY_TOPIC = 'dampscan-test-topic';
  delete process.env.NTFY_URL;
  delete process.env.NTFY_TOKEN;
});
after(async () => { await pool.end(); });

test('a job saved, paid and frozen reaches the phone, with the business and the money and never the customer', async () => {
  const { id, cookie } = await scott();
  const job = (await post(cookie, { op: 'save', site: 'roofing', customerName: CUSTOMER, customerPostcode: 'BR1 1AA', invoiceNetPence: P(3000), status: 'booked', finderPersonId: id })).json().job;
  await post(cookie, { op: 'cost', id: job.id, label: 'Materials', amountPence: P(1000) });
  await post(cookie, { op: 'save', id: job.id, site: 'roofing', customerName: CUSTOMER, invoiceNetPence: P(3000), status: 'completed' });
  await post(cookie, { op: 'payment', id: job.id, amountPence: P(1000), label: 'deposit' });
  await post(cookie, { op: 'payment', id: job.id, amountPence: P(2000), label: 'balance' });
  await post(cookie, { op: 'freeze', id: job.id });
  await post(cookie, { op: 'unfreeze', id: job.id, reason: `${CUSTOMER} disputed the skip` });

  const kinds = (await rows()).map((r) => r.kind);
  assert.deepEqual(kinds, ['job_created', 'job_status', 'payment', 'payment', 'payout_frozen', 'payout_reopened'], 'a cost line is routine and says nothing');
  assert.equal(pushes.length, 6);
  assert.ok(pushes.every((p) => p.url === 'https://ntfy.sh' && p.body.topic === 'dampscan-test-topic'));
  const texts = pushes.map((p) => p.body.title + ' ' + p.body.message);
  for (const t of texts) {
    assert.ok(!/priya|sharma|br1/i.test(t), `a push carried customer detail: ${t}`);
    assert.ok(t.startsWith('Verge Roofing:'), t);
  }
  assert.match(texts[0], /new job.*Job #1 saved as booked, £3,000\.00 net/);
  assert.match(texts[1], /job now completed/);
  assert.match(texts[2], /payment received.*£1,000\.00 on Job #1\. £2,000\.00 still to come/);
  assert.match(texts[3], /paid in full.*£2,000\.00 on Job #1\. £3,000\.00 received of £3,000\.00/);
  assert.match(texts[4], /payout frozen.*£81\.00 to pay out across 1 person/);
  assert.match(texts[5], /payout reopened/);
  assert.ok((await rows()).every((r) => r.push_sent_at && r.business_slug === 'roofing' && Number(r.ref) === job.id));
});

test('with no topic the rows still land and nothing is sent; with ntfy down the write still succeeds', async () => {
  const { cookie } = await scott();
  delete process.env.NTFY_TOPIC;
  const res = await post(cookie, { op: 'save', site: 'roofing', customerName: CUSTOMER, invoiceNetPence: P(500) });
  assert.equal(res.statusCode, 200);
  assert.equal(pushes.length, 0);
  let r = await rows();
  assert.equal(r.length, 1);
  assert.equal(r[0].push_sent_at, null);

  process.env.NTFY_TOPIC = 'dampscan-test-topic';
  ntfyDown = true;
  const again = await post(cookie, { op: 'save', site: 'roofing', customerName: CUSTOMER, invoiceNetPence: P(600) });
  assert.equal(again.statusCode, 200, 'a push that fails never fails the write');
  r = await rows();
  assert.equal(r.length, 2);
  assert.equal(r[1].push_sent_at, null);
});

test('the morning digest says what is on, what is waiting and what happened, per business, and only when there is something', async () => {
  const { cookie } = await scott();
  const noSecret = await call(digest, { method: 'GET', url: '/api/cron/digest' });
  assert.equal(noSecret.statusCode, 401);

  const tomorrow = (await pool.query(`select ((now() at time zone 'Europe/London')::date + 1)::text as d`)).rows[0].d;
  await post(cookie, { op: 'save', site: 'roofing', customerName: CUSTOMER, invoiceNetPence: P(3000), status: 'booked', jobDate: tomorrow });
  const done = (await post(cookie, { op: 'save', site: 'roofing', customerName: 'Another Customer', invoiceNetPence: P(800), status: 'completed' })).json().job;
  await post(cookie, { op: 'payment', id: done.id, amountPence: P(300) });
  await pool.query(`update jobs set created_at = now() - interval '9 days' where id = (select id from jobs where status = 'quoted' limit 1)`);
  await post(cookie, { op: 'save', site: 'roofing', customerName: 'Old Quote', invoiceNetPence: P(2000), status: 'quoted' });
  await pool.query(`update jobs set created_at = now() - interval '9 days' where customer_name = 'Old Quote'`);
  pushes = [];

  const res = await call(digest, { method: 'GET', url: '/api/cron/digest', headers: { authorization: 'Bearer a-cron-secret-that-is-long-enough' } });
  assert.equal(res.statusCode, 200, res.body);
  const sent = res.json().sent;
  assert.deepEqual(sent.map((s) => s.business), ['roofing'], 'CoolRight and the damp brands had nothing to say');
  assert.equal(pushes.length, 1);
  const text = pushes[0].body.title + ' ' + pushes[0].body.message;
  assert.ok(text.startsWith('Verge Roofing: this morning'), text);
  assert.match(text, /1 job tomorrow\./);
  assert.match(text, /1 quote out over a week with no answer\./);
  assert.match(text, /£500\.00 outstanding on 1 completed job\./);
  assert.match(text, /Since the last digest: 3 jobs saved, 1 payment received\./);
  assert.ok(!/priya|sharma|another|old quote/i.test(text), text);
  assert.ok((await rows()).every((r) => r.digest_sent_at), 'everything summarised is stamped');

  pushes = [];
  const quiet = await call(digest, { method: 'GET', url: '/api/cron/digest', headers: { authorization: 'Bearer a-cron-secret-that-is-long-enough' } });
  assert.equal(quiet.json().sent.length, 1, 'tomorrow\'s job and the unpaid one are still worth saying');
  assert.ok(!/Since the last digest/.test(pushes[0].body.message), 'but nothing new happened');
});
