/**
 * Company, Overview (the owners' plan, 15 Nov 2026): what needs an owner now,
 * this month against last, booked ahead, and where the year is heading.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const O = await import('../lib/company-overview.js');

const SETTINGS = "update job_settings set tax_bp = 2000, lead_bp = 1500, lead_earner = 'scott', partner_a = 'tom', partner_b = 'ben'";
before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, paid_out, expenses restart identity cascade'); await pool.query("delete from cron_beats where name = 'bank_check_to'"); await pool.query(SETTINGS); });
after(async () => { await pool.query(SETTINGS); await pool.end(); });

const job = (days, paid) => pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence,
    date_set, job_date, job_time, paid_at, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
  values ('dampscan', $2, 'Kim Lee', 'ME19 6AB', 'full-house', 29500, 'ronnie', 10000, true, current_date + $1::int, '10:00', $3, 2000, 1500, 'scott', 'tom', 'ben')`,
  [days, days > 0 ? 'booked' : 'completed', paid ? new Date() : null]);

test('needs you now: people owed, money to collect, salaries and ad spend not logged', async () => {
  await job(-2, true);
  await job(-1, false);
  await job(5, false);
  const o = await O.overview();
  const says = o.attention.map((a) => a.text);
  assert.ok(says.includes('Ronnie is owed £100'), says.join(' | '));
  assert.ok(says.some((t) => /^1 survey done, £295 to collect$/.test(t)));
  assert.ok(says.some((t) => /^No salary recorded for Scott in /.test(t)));
  assert.ok(says.some((t) => /^No Google Ads spend logged for /.test(t)));
  assert.equal(o.attention.find((a) => a.text.startsWith('Ronnie')).who, 'ronnie');
  assert.equal(o.month.in, 29500);
  assert.equal(o.month.surveys, 1);
  assert.equal(o.ahead.surveys, 1);
  assert.equal(o.ahead.pence, 29500);
  assert.equal(o.months.length, 6);
  assert.equal(o.months[5].in, 29500);
  assert.ok(o.projection.projIn >= o.projection.yearIn);
});

test('once paid out and logged, those items go', async () => {
  await job(-2, true);
  const o1 = await O.overview();
  assert.ok(o1.attention.find((a) => /No salary recorded for Scott/.test(a.text)));
  if (new Date().getUTCDate() >= 3) assert.ok(o1.attention.find((a) => /^Bank check for \w+ not done$/.test(a.text) && a.tab === 'bank'));
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); const day = d.toISOString().slice(0, 10);
  await pool.query("insert into paid_out (person_key, amount_pence, paid_on, how) values ('scott', 104750, $1, 'Salary'), ('tom', 104750, $1, 'Salary'), ('ronnie', 10000, current_date, 'Bank transfer')", [day]);
  await pool.query("insert into expenses (spent_on, amount_pence, category) values ($1, 20000, 'Google Ads')", [day]);
  const end = new Date(); end.setUTCDate(0);
  await pool.query("insert into cron_beats (name, at) values ('bank_check_to', $1::date) on conflict (name) do update set at = excluded.at", [end.toISOString().slice(0, 10)]);
  const says = (await O.overview()).attention.map((a) => a.text);
  assert.ok(!says.some((t) => /No salary|No Google Ads|Ronnie is owed|Bank check/.test(t)), says.join(' | '));
});
