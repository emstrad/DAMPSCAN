/**
 * Service contracts: started from a job, due on an interval, rolled forward
 * by a service, surfaced on the Due page and in the digest, and scoped.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'contracts-test-secret-long-enough-x';
process.env.IP_SALT = 'contracts-test-salt';
process.env.STAFF_ACCESS_CODE = '1290';
process.env.CRON_SECRET = 'a-cron-secret-that-is-long-enough';
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

const login = (await import('../lib/routes/auth/login.js')).default;
const quoted = (await import('../lib/routes/admin/quoted.js')).default;
const contracts = (await import('../lib/routes/admin/contracts.js')).default;
const due = (await import('../lib/routes/admin/due.js')).default;
const { digestFor } = await import('../lib/digest.js');

function makeReq({ method = 'POST', url = '/api/admin/contracts', body, headers = {} } = {}) {
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
  const raw = res.getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
}
const post = (cookie, body) => call(contracts, { body, headers: { cookie } });
const get = (cookie, qs = '') => call(contracts, { method: 'GET', url: `/api/admin/contracts${qs}`, headers: { cookie } });
const job = (cookie, body) => call(quoted, { url: '/api/admin/quoted', body, headers: { cookie } });

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, job_costs, job_owner_days, job_payments, payouts, notifications, service_contracts restart identity cascade');
});
after(async () => { await pool.end(); });

const addMonths = (iso, months) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

test('a contract starts from the install job, is due an interval later, and a service rolls it forward from the service day', async () => {
  await person('Scott', 'scott-code', ['ac', 'roofing'], true, 'manage');
  await person('Steve', 'steve-code', ['roofing']);
  const cookie = await signIn('scott-code');
  const installed = '2026-06-10';
  const j = (await job(cookie, { op: 'save', site: 'ac', customerName: 'Two splits', customerPostcode: 'DA1 1AA', invoiceNetPence: 280000, status: 'completed', jobDate: installed })).json().job;

  const made = (await post(cookie, { op: 'save', site: 'ac', jobId: j.id, unitCount: 2, refrigerantKg: '1.2' })).json();
  assert.equal(made.ok, true, JSON.stringify(made));
  const c = made.contract;
  assert.equal(c.customerName, 'Two splits', 'the customer comes from the job');
  assert.equal(c.installedOn, installed);
  assert.equal(c.intervalMonths, 12);
  assert.equal(c.nextDueOn, addMonths(installed, 12), 'install plus the interval');
  assert.deepEqual([c.unitCount, c.refrigerantKg, c.status], [2, 1.2, 'active']);

  const reminded = (await post(cookie, { op: 'contacted', id: c.id, on: '2027-05-20' })).json().contract;
  assert.equal(reminded.lastContactedOn, '2027-05-20');
  const serviced = (await post(cookie, { op: 'serviced', id: c.id, on: '2027-06-25' })).json().contract;
  assert.equal(serviced.lastServicedOn, '2027-06-25');
  assert.equal(serviced.nextDueOn, '2028-06-25', 'a service done late is still a service: the next one is a year from the day it was done');

  const byJob = (await get(cookie, `?jobId=${j.id}`)).json().contracts;
  assert.equal(byJob.length, 1);
  assert.equal((await get(await signIn('steve-code'), `?jobId=${j.id}`)).json().contracts.length, 0, 'not Steve\'s business');
  assert.equal((await post(await signIn('steve-code'), { op: 'serviced', id: c.id })).statusCode, 404);
  assert.equal((await post(cookie, { op: 'save', site: 'roofing', jobId: j.id })).statusCode, 400, 'a job on another business is refused');
});

test('services falling due show on the Due page and in the digest, overdue first', async () => {
  await person('Scott', 'scott-code', ['ac'], true, 'manage');
  const cookie = await signIn('scott-code');
  const dates = (await pool.query(`select ((now() at time zone 'Europe/London')::date - 5)::text as overdue, ((now() at time zone 'Europe/London')::date + 10)::text as soon, ((now() at time zone 'Europe/London')::date + 90)::text as later`)).rows[0];
  for (const [name, on] of [['Later', dates.later], ['Soon', dates.soon], ['Overdue', dates.overdue]]) {
    const r = await post(cookie, { op: 'save', site: 'ac', customerName: name, nextDueOn: on });
    assert.equal(r.statusCode, 200, r.body);
  }
  const d = (await call(due, { method: 'GET', url: '/api/admin/due', headers: { cookie } })).json();
  assert.deepEqual(d.services.map((s) => [s.customerName, s.daysUntilDue]), [['Overdue', -5], ['Soon', 10]]);
  const lines = await digestFor({ slug: 'ac', name: 'CoolRight', payout_model: 'ac' });
  assert.ok(lines.includes('1 service overdue.') && lines.includes('1 service due in the next month.'), lines.join(' | '));
  const dueList = (await get(cookie, '?due=30')).json().contracts;
  assert.deepEqual(dueList.map((c) => c.customerName), ['Overdue', 'Soon']);
});
