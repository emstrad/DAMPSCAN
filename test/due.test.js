/**
 * The Due page's route: what needs doing, scoped, with money only for
 * whoever manages the business.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'due-test-secret-long-enough-xxxxxxx';
process.env.IP_SALT = 'due-test-salt';
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
const due = (await import('../lib/routes/admin/due.js')).default;

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
  const raw = res.getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
}
const post = (cookie, body) => call(quoted, { body, headers: { cookie } });
const get = (cookie, qs = '') => call(due, { method: 'GET', url: `/api/admin/due${qs}`, headers: { cookie } });

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, job_costs, job_owner_days, job_payments, payouts, notifications restart identity cascade');
});
after(async () => { await pool.end(); });

async function world() {
  const scott = await person('Scott', 'scott-code', ['dampscan', 'ati-london', 'roofing', 'ac'], true, 'manage');
  await person('Steve', 'steve-code', ['roofing']);
  const boss = await signIn('scott-code');
  const dates = (await pool.query(`select ((now() at time zone 'Europe/London')::date + 1)::text as tomorrow, ((now() at time zone 'Europe/London')::date - 3)::text as past`)).rows[0];
  await pool.query(`insert into leads (site, stage, first_name, email, postcode, session_id, issues) values ('dampscan', 'complete', 'Priya', 'p@x.com', 'ME14 1AA', gen_random_uuid(), array['Damp'])`);
  const j = async (body) => (await post(boss, body)).json().job;
  await j({ op: 'save', site: 'roofing', customerName: 'Tomorrow', invoiceNetPence: P(1000), status: 'booked', jobDate: dates.tomorrow });
  await j({ op: 'save', site: 'ac', customerName: 'AC tomorrow', invoiceNetPence: P(900), status: 'booked', jobDate: dates.tomorrow });
  const stale = await j({ op: 'save', site: 'roofing', customerName: 'Old quote', invoiceNetPence: P(2000), status: 'quoted' });
  await pool.query(`update jobs set created_at = now() - interval '10 days' where id = $1`, [stale.id]);
  const unpaid = await j({ op: 'save', site: 'roofing', customerName: 'Unpaid', invoiceNetPence: P(800), status: 'completed', jobDate: dates.past });
  await post(boss, { op: 'payment', id: unpaid.id, amountPence: P(300) });
  const ready = await j({ op: 'save', site: 'roofing', customerName: 'Ready', invoiceNetPence: P(500), status: 'completed', jobDate: dates.past, finderPersonId: scott });
  await post(boss, { op: 'payment', id: ready.id, amountPence: P(500) });
  const drifted = await j({ op: 'save', site: 'roofing', customerName: 'Drifted', invoiceNetPence: P(3000), status: 'completed', jobDate: dates.past, finderPersonId: scott });
  await post(boss, { op: 'payment', id: drifted.id, amountPence: P(3000) });
  await post(boss, { op: 'freeze', id: drifted.id });
  await post(boss, { op: 'cost', id: drifted.id, label: 'Late skip', amountPence: P(400) });
  return { boss, steve: await signIn('steve-code'), stale, unpaid, ready, drifted };
}

test('an admin sees the whole morning, in order, with the money', async () => {
  const w = await world();
  const d = (await get(w.boss)).json();
  assert.equal(d.money, true);
  assert.deepEqual(d.enquiries.map((e) => [e.site, e.firstName, e.issues]), [['dampscan', 'Priya', ['Damp']]]);
  assert.deepEqual(d.visits.map((v) => [v.site, v.customerName, v.valuePence]), [['roofing', 'Tomorrow', P(1000)], ['ac', 'AC tomorrow', P(900)]]);
  assert.deepEqual(d.quotes.map((q) => [q.id, q.ageDays]), [[w.stale.id, 10]]);
  assert.deepEqual(d.owed.map((o) => [o.id, o.owedPence, o.quoted]), [[w.unpaid.id, P(500), true]]);
  assert.deepEqual(d.ready.map((r) => [r.id, r.owedPence, r.owedRows]), [[w.ready.id, P(50), 1]], '5% of 405 is under the floor, so the floor');
  assert.deepEqual(d.drifted.map((r) => [r.id, r.driftPence]), [[w.drifted.id, -P(16.20)]]);
  const roofing = (await get(w.boss, '?site=roofing')).json();
  assert.equal(roofing.visits.length, 1, 'the site filter narrows every section');
  assert.equal(roofing.enquiries.length, 0);
});

test('a worker sees their business\'s day and none of its money', async () => {
  const w = await world();
  const d = (await get(w.steve)).json();
  assert.equal(d.money, false);
  assert.deepEqual(d.sites, ['roofing']);
  assert.deepEqual(d.enquiries, [], 'the damp enquiry is not his');
  assert.deepEqual(d.visits.map((v) => v.customerName), ['Tomorrow']);
  assert.equal(d.quotes.length, 1, 'a quote to chase is work, not money');
  assert.deepEqual([d.owed, d.ready, d.drifted], [[], [], []]);
  assert.equal((await get(w.steve, '?site=ac')).json().visits.length, 0, 'asking for another business yields nothing');
});
