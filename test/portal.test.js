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
  assert.equal(p.next.kind, 'deposit');
  assert.match(p.next.title, /£147\.50/);
  assert.deepEqual(p.visit, { date: '2030-06-01', time: '10:00', surveyor: 'Ben' });
  assert.equal(p.firstName, 'Kim');
  assert.ok(!JSON.stringify(p).includes('staff only note'));
  assert.equal(p.reviewUrl, null);
});

test('the report stays locked until paid in full, then the review is offered', async () => {
  const id = await job();
  await pool.query("update jobs set deposit_paid_at = now(), survey_sent_at = now(), report_path = 'r/x.pdf', report_name = 'Report.pdf' where id = $1", [id]);
  let { p } = await view(id);
  assert.equal(p.next.kind, 'balance');
  assert.equal(p.report.unlocked, false);
  await pool.query('update jobs set paid_at = now() where id = $1', [id]);
  ({ p } = await view(id));
  assert.equal(p.next.kind, 'report');
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
