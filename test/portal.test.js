/**
 * The customer portal: a private link per survey, the one next step, the
 * report locked until paid in full, nothing staff-only, and 12-month links.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'portal-secret-long-enough-xxxxxxxxxxx';
process.env.IP_SALT = 'portal-salt-long-enough';
process.env.REVIEW_URL_DAMPSCAN = 'https://g.page/r/example/review';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const { issuePortal, findPortal, portalView } = await import('../lib/portal.js');
const handler = (await import('../api/quote.js')).default;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, audit, notifications, estate_agents restart identity cascade'); });
after(async () => { await pool.end(); });

const job = async (extra = '') => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_price_pence, date_set, job_date, job_time, surveyor, note, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', 'Mrs Kim Lee', 'ME19 6AB', 29500, true, '2030-06-01', '10:00', 'ben', 'staff only note', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`)).rows[0].id);
const view = async (id) => { const url = await issuePortal(id); const t = new URL(url).searchParams.get('t'); return { url, t, p: await portalView((await findPortal(t)).job, '2030-05-01') }; };

test('a booked survey asks for the deposit first, with the visit and nothing staff-only', async () => {
  const id = await job();
  const { url, p } = await view(id);
  assert.match(url, /^https:\/\/dampscan\.co\.uk\/my\.html\?t=/);
  assert.equal(p.state, 'deposit');
  assert.equal(p.money.minNowPence, 14750);
  assert.equal(p.money.balancePence, 29500);
  assert.equal(p.code, 's1', 'the page carries a code, never a brand name in its markup');
  assert.equal(p.reference, `KIM${String(id).padStart(4, '0')}`);
  assert.deepEqual(p.visit, { date: '2030-06-01', time: '10:00', surveyor: 'Ben' });
  assert.equal(p.firstName, 'Kim');
  assert.ok(!JSON.stringify(p).includes('staff only note'));
  assert.equal(p.reviewUrl, null);
});

test('the report stays locked until paid in full, then the review is offered', async () => {
  const id = await job();
  await pool.query("update jobs set deposit_paid_at = now(), survey_sent_at = now(), report_path = 'r/x.pdf', report_name = 'Report.pdf' where id = $1", [id]);
  let { p } = await view(id);
  assert.equal(p.state, 'ready');
  assert.equal(p.report.unlocked, false);
  assert.equal(p.money.balancePence, 14750);
  await pool.query('update jobs set paid_at = now() where id = $1', [id]);
  ({ p } = await view(id));
  assert.equal(p.state, 'report');
  assert.equal(p.report.unlocked, true);
  assert.equal(p.reviewUrl, 'https://g.page/r/example/review');
});

test('a new link replaces the old, links last 12 months, and only damp surveys get one', async () => {
  const id = await job();
  const first = (await view(id)).t;
  await issuePortal(id);
  assert.equal((await findPortal(first)).gone, 'not_found');
  await pool.query("update jobs set portal_issued_at = now() - interval '366 days' where id = $1", [id]);
  const t = (await pool.query('select portal_token from jobs where id = $1', [id])).rows[0].portal_token;
  assert.equal((await findPortal(t)).gone, 'expired');
  const roof = Number((await pool.query("insert into jobs (site, status, customer_name, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp) values ('roofing', 'quoted', 'Al', 0, 0, '', '', '', 0, 0, 0, 5000) returning id")).rows[0].id);
  assert.equal(await issuePortal(roof), null);
});

test('the page route answers 404 for a wrong link and 410 for an old one', async () => {
  const call = async (q) => { const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
    await handler({ method: 'GET', url: '/api/quote?doc=portal&' + q, headers: { 'x-forwarded-for': '1.2.3.4' }, socket: {} }, res); return res; };
  assert.equal((await call('t=' + 'x'.repeat(32))).statusCode, 404);
  const id = await job();
  const { t } = await view(id);
  assert.equal((await call('t=' + t)).statusCode, 200);
  await pool.query("update jobs set portal_issued_at = now() - interval '400 days' where id = $1", [id]);
  assert.equal((await call('t=' + t)).statusCode, 410);
});


const call = async (q) => { const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler({ method: 'GET', url: '/api/quote?doc=portal&' + q, headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'iPhone' }, socket: {} }, res); return res; };

test('the report downloads only with the right postcode, and five wrong tries lock it and tell the team', async () => {
  const id = await job();
  await pool.query("update jobs set paid_at = now(), survey_sent_at = now(), report_path = 'r/x.pdf' where id = $1", [id]);
  const { t } = await view(id);
  for (let i = 0; i < 4; i += 1) assert.equal((await call(`t=${t}&file=report&pc=ME1 1AA`)).statusCode, 403);
  assert.equal((await call(`t=${t}&file=report&pc=ME1 1AA`)).statusCode, 429, 'the fifth wrong try locks it');
  assert.equal((await call(`t=${t}&file=report&pc=me19 6ab`)).statusCode, 429, 'even the right postcode waits out the lock');
  const todo = (await pool.query('select text from todos where job_id = $1', [id])).rows[0];
  assert.match(todo.text, /wrong postcode 5 times/);
  const kinds = (await pool.query('select kind from portal_events where job_id = $1 order by id', [id])).rows.map((r) => r.kind);
  assert.ok(kinds.includes('opened') && kinds.includes('locked'));
});

test('cancelled 48 hours or more before is a full refund; later the deposit is kept', async () => {
  const id = await job();
  await pool.query("update jobs set deposit_paid_at = now(), job_date = (now() + interval '10 days')::date where id = $1", [id]);
  await pool.query("update jobs set status = 'cancelled' where id = $1", [id]);
  let { p } = await view(id);
  assert.deepEqual([p.state, p.cancel.rule, p.cancel.pence], ['cancelled', 'refund', 14750]);
  const late = await job();
  await pool.query("update jobs set deposit_paid_at = now(), job_date = (now() at time zone 'Europe/London')::date + 1, job_time = '09:00' where id = $1", [late]);
  await pool.query("update jobs set status = 'cancelled' where id = $1", [late]);
  ({ p } = await view(late));
  assert.equal(p.cancel.rule, 'kept');
});

test('an agent booking, a picked time, extras and real payments all show as they are', async () => {
  const id = await job();
  await pool.query("update jobs set awaiting_agent = true, extras = '{camera}' where id = $1", [id]);
  let { p } = await view(id);
  assert.equal(p.state, 'agent');
  assert.equal(p.money.lines.length, 2, 'the survey and its extra, each with its price');
  await pool.query("update jobs set awaiting_agent = false, job_time = null, date_set = false, pencil_date = '2030-06-03', pencil_time = '11:00' where id = $1", [id]);
  ({ p } = await view(id));
  assert.deepEqual([p.state, p.requested.time], ['requested', '11:00']);
  await pool.query("update jobs set date_set = true, job_time = '10:00', pencil_date = null where id = $1", [id]);
  await pool.query("insert into job_payments (job_id, amount_pence, label) values ($1, 20000, 'payment')", [id]);
  ({ p } = await view(id));
  assert.deepEqual([p.state, p.money.paidPence, p.money.balancePence, p.money.minNowPence], ['booked', 20000, 9500, 0]);
});

test('an expired link can ask for a new one, which is a to-do and an alert, once a day', async () => {
  const id = await job();
  const { t } = await view(id);
  await pool.query("update jobs set portal_issued_at = now() - interval '400 days' where id = $1", [id]);
  const post = async () => { const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
    await handler({ method: 'POST', url: '/api/quote', headers: { 'x-forwarded-for': '1.2.3.4', 'content-type': 'application/json' }, socket: {}, body: { doc: 'portal', op: 'newlink', t } }, res); return res; };
  assert.equal((await post()).statusCode, 200);
  assert.equal((await post()).statusCode, 200);
  assert.equal((await pool.query('select count(*)::int as n from todos where job_id = $1', [id])).rows[0].n, 1, 'asked twice, one to-do');
  assert.equal(JSON.parse((await call('t=' + t)).body).code, 's1');
});
