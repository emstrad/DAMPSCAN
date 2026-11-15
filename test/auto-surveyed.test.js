/**
 * Surveyed by itself (UAT, 15 Nov 2026): a booked survey whose visit is over,
 * or whose report is in, becomes Surveyed with a line in its history; nothing
 * else moves. And the every-minute texts call is locked to CRON_SECRET.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const { markSurveyed } = await import('../lib/auto-surveyed.js');
const textsCron = (await import('../lib/routes/cron/texts.js')).default;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, audit restart identity cascade'); });
after(async () => { await pool.end(); });

/* A survey starting `mins` from now (London), on today's date. */
async function job(mins, extra = {}) {
  const at = new Date(Date.now() + mins * 60000);
  const day = at.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const time = at.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const r = await pool.query(`insert into jobs (site, status, customer_name, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time,
      awaiting_agent, report_path, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('dampscan', $1, 'Kim', 'localised', 21500, 'tom', 10000, true, $2, $3, $4, $5, 2000, 1500, 'scott', 'tom', 'ben') returning id`,
    [extra.status || 'booked', day, time, extra.agent || false, extra.report || null]);
  return Number(r.rows[0].id);
}
const status = async (id) => (await pool.query('select status from jobs where id = $1', [id])).rows[0].status;

test('a visit that is over, or a report uploaded, is Surveyed; nothing else moves', async () => {
  const over = await job(-120);            // started two hours ago, an hour on site: over
  const now = await job(-20);              // still on site
  const later = await job(180);            // this afternoon
  const reported = await job(180, { report: 'leads/2026-11-15/abc-report.pdf' });
  const agent = await job(-240, { agent: true });
  const gone = await job(-240, { status: 'cancelled' });
  assert.equal(await markSurveyed(), 2);
  assert.equal(await status(over), 'completed');
  assert.equal(await status(reported), 'completed');
  for (const id of [now, later, agent]) assert.equal(await status(id), 'booked');
  assert.equal(await status(gone), 'cancelled');
  const said = (await pool.query("select after_json->>'said' as said from audit where action = 'auto_surveyed' order by entity_id")).rows.map((r) => r.said);
  assert.deepEqual(said, ['Marked surveyed: the visit time has passed.', 'Marked surveyed: the report was uploaded.']);
  assert.equal(await markSurveyed(), 0, 'once only');
});

test('the every-minute texts call needs CRON_SECRET', async () => {
  const res = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } });
  process.env.CRON_SECRET = 'texts-cron-secret-long-enough';
  const no = res(); await textsCron({ method: 'GET', url: '/api/cron/texts', headers: {} }, no);
  assert.equal(no.statusCode, 401);
  const yes = res(); await textsCron({ method: 'GET', url: '/api/cron/texts', headers: { authorization: 'Bearer texts-cron-secret-long-enough' } }, yes);
  assert.equal(yes.statusCode, 200, yes.body);
  assert.equal(JSON.parse(yes.body).ok, true);
});
