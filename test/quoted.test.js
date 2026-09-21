/**
 * A quoted-trade job, end to end through the real route.
 *
 * The roofing figures are the agreement's Example B, reached by entering the
 * invoice, two cost lines and three owners' days the way a person would, and
 * read back worked out. Then the money clears, the payout freezes, a cost
 * lands late, and the stored figure stands while the drift is reported.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'quoted-test-secret-long-enough-xxxx';
process.env.IP_SALT = 'quoted-test-salt';
process.env.STAFF_ACCESS_CODE = '1290';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const login = (await import('../lib/routes/auth/login.js')).default;
const quoted = (await import('../lib/routes/admin/quoted.js')).default;

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
async function person(name, code, grants, isAdmin = false, level = 'work') {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,$3) returning id', [name, h, isAdmin]);
  for (const g of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1,$2,$3)', [rows[0].id, g, level]);
  return Number(rows[0].id);
}
async function signIn(code) {
  const res = await call(login, { url: '/api/auth/login', body: { code } });
  assert.equal(res.statusCode, 200, res.body);
  const raw = res.getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
}
const post = (cookie, body) => call(quoted, { body, headers: { cookie } });

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate leads, events, rate_hits, jobs, people, audit, job_costs, job_owner_days, job_payments, payouts restart identity cascade'); });
after(async () => { await pool.end(); });

test('the agreement\'s Example B, entered as a person would, comes out at 182.25 and a 287.25 loss', async () => {
  const scott = await person('Scott', 'scott-code', ['roofing'], true);
  const tom = await person('Tom', 'tom-code', ['roofing']);
  const steve = await person('Steve', 'steve-code', ['roofing']);
  const ben = await person('Ben', 'ben-code', ['roofing']);
  const cookie = await signIn('scott-code');

  const created = (await post(cookie, { op: 'save', site: 'roofing', customerName: 'Re-roof, Bromley', invoiceNetPence: P(10000), status: 'booked', finderPersonId: scott })).json();
  assert.equal(created.ok, true, JSON.stringify(created));
  const id = created.job.id;
  assert.deepEqual(created.job.rates, { reserveBp: 1900, feeBp: 500, feeFloorPence: P(50), splitBp: 5000 }, 'the rates it was created under, from the business');

  await post(cookie, { op: 'cost', id, label: 'Materials', amountPence: P(4500) });
  await post(cookie, { op: 'cost', id, label: 'Scaffolding', amountPence: P(1000) });
  for (const p of [tom, steve, ben]) await post(cookie, { op: 'days', id, personId: p, days: 5, dayRatePence: P(250) });

  const job = (await call(quoted, { method: 'GET', url: '/api/admin/quoted?range=all', headers: { cookie } })).json().jobs[0];
  assert.equal(job.payout.scottFee, P(182.25));
  assert.equal(job.payout.wages, P(3750));
  assert.equal(job.payout.retained, -P(287.25));
  assert.equal(job.payout.lossMaking, true);
  assert.equal(job.costs.length, 2);
  assert.equal(job.costs[0].addedBy, scott, 'every cost line says who entered it');
  assert.equal(job.frozen, null, 'nothing is frozen until the money clears');
  assert.equal(job.money.outstandingPence, P(10000));
});

test('the payout freezes when the money clears, and a late cost reports drift without moving it', async () => {
  const scott = await person('Scott', 'scott-code', ['roofing'], true);
  const cookie = await signIn('scott-code');
  const id = (await post(cookie, { op: 'save', site: 'roofing', customerName: 'Flat roof', invoiceNetPence: P(3000), finderPersonId: scott })).json().job.id;
  await post(cookie, { op: 'cost', id, label: 'Materials', amountPence: P(1000) });

  const early = await post(cookie, { op: 'freeze', id });
  assert.equal(early.statusCode, 400, 'cannot freeze before the money is in');

  await post(cookie, { op: 'payment', id, amountPence: P(1500), label: 'deposit' });
  await post(cookie, { op: 'payment', id, amountPence: P(1500), label: 'balance' });
  const frozen = (await post(cookie, { op: 'freeze', id })).json();
  assert.equal(frozen.ok, true, JSON.stringify(frozen));
  assert.equal(frozen.job.status, 'paid');
  assert.equal(frozen.job.money.paidInFull, true);
  /* 3000 - 1000 = 2000 balance, less 19% = 1620, 5% = 81.00 */
  assert.equal(frozen.job.frozen.rows.find((r) => r.key === 'finder').amountPence, P(81));
  assert.equal(frozen.job.frozen.driftPence, 0);

  const late = (await post(cookie, { op: 'cost', id, label: 'Skip, invoiced late', amountPence: P(400) })).json();
  assert.equal(late.job.frozen.rows.find((r) => r.key === 'finder').amountPence, P(81), 'the stored figure stands');
  assert.equal(late.job.payout.scottFee, P(64.80), 'the engine says what it would now be');
  assert.equal(late.job.frozen.driftPence, P(64.80) - P(81), 'and the difference is reported, not resolved');

  const audit = (await pool.query(`select action from audit where entity_id = $1 order by id`, [id])).rows.map((r) => r.action);
  assert.deepEqual(audit, ['quoted_create', 'quoted_cost', 'quoted_payment', 'quoted_payment', 'quoted_freeze', 'quoted_cost']);
});

test('a worker can enter costs but cannot freeze, and an admin needs a reason to unfreeze', async () => {
  const scott = await person('Scott', 'scott-code', ['roofing'], true);
  await person('Steve', 'steve-code', ['roofing']);
  const boss = await signIn('scott-code');
  const steve = await signIn('steve-code');
  const id = (await post(boss, { op: 'save', site: 'roofing', customerName: 'Gutters', invoiceNetPence: P(600), finderPersonId: scott })).json().job.id;
  assert.equal((await post(steve, { op: 'cost', id, label: 'Brackets', amountPence: P(40) })).statusCode, 200, 'Steve enters what he bought');
  await post(boss, { op: 'payment', id, amountPence: P(600) });
  assert.equal((await post(steve, { op: 'freeze', id })).statusCode, 403, 'but does not decide when it is paid');
  assert.equal((await post(boss, { op: 'freeze', id })).statusCode, 200);
  assert.equal((await post(boss, { op: 'unfreeze', id })).statusCode, 400, 'no reason, no reopening');
  const reopened = (await post(boss, { op: 'unfreeze', id, reason: 'Customer disputed the skip' })).json();
  assert.equal(reopened.job.frozen, null);
  assert.equal(reopened.job.status, 'completed');
  const stored = (await pool.query('select override_reason from payouts where job_id = $1', [id])).rows[0];
  assert.equal(stored.override_reason, 'Customer disputed the skip');
});

test('the agreed AC example splits 1,000 of profit into 500 and 500, and a loss into nothing', async () => {
  await person('Scott', 'scott-code', ['ac'], true);
  const cookie = await signIn('scott-code');
  const id = (await post(cookie, { op: 'save', site: 'ac', customerName: 'Two splits', invoiceNetPence: P(2800) })).json().job.id;
  await post(cookie, { op: 'cost', id, label: 'Units', amountPence: P(1200) });
  const job = (await post(cookie, { op: 'cost', id, label: 'Labour', amountPence: P(600) })).json().job;
  assert.equal(job.model, 'ac');
  assert.deepEqual(job.payout.pay, { scott: P(500), tom: P(500) });
  assert.deepEqual(job.payoutRows.map((r) => [r.key, r.amountPence]), [['scott', P(500)], ['tom', P(500)]]);
  const loss = (await post(cookie, { op: 'cost', id, label: 'Crane', amountPence: P(1500) })).json().job;
  assert.equal(loss.payout.profit, -P(500));
  assert.deepEqual(loss.payout.pay, { scott: 0, tom: 0 });
});

test('a damp business is not this route\'s to touch, and a job cannot change business', async () => {
  await person('Scott', 'scott-code', ['dampscan', 'roofing', 'ac'], true);
  await person('Steve', 'steve-code', ['roofing']);
  const cookie = await signIn('scott-code');
  assert.equal((await post(cookie, { op: 'save', site: 'dampscan', customerName: 'x', invoiceNetPence: 1 })).statusCode, 403);
  const id = (await post(cookie, { op: 'save', site: 'roofing', customerName: 'x', invoiceNetPence: P(100) })).json().job.id;
  assert.equal((await post(cookie, { op: 'save', id, site: 'ac', customerName: 'x', invoiceNetPence: P(100) })).statusCode, 400, 'both in scope, so the move rule is what refuses');
  assert.equal((await post(cookie, { op: 'freeze', id: 999999 })).statusCode, 404);
  /* Steve has roofing only. A move to a brand outside his scope is refused as
     out of scope, not explained, so the response gives nothing away. */
  const steve = await signIn('steve-code');
  assert.equal((await post(steve, { op: 'save', id, site: 'ac', customerName: 'x', invoiceNetPence: P(100) })).statusCode, 403);
  const acJob = (await post(cookie, { op: 'save', site: 'ac', customerName: 'y', invoiceNetPence: P(100) })).json().job.id;
  assert.equal((await post(steve, { op: 'cost', id: acJob, label: 'x', amountPence: 1 })).statusCode, 404, 'a job outside scope does not exist');
});
