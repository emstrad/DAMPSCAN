/**
 * Company, Accountant (the owner, 20 Nov 2026): filing and payment dates by
 * the rules, the checks an accountant would raise, and the year's records as
 * a file safe to open in a spreadsheet.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const A = await import('../lib/accountant.js');
const C = await import('../lib/accountant-csv.js');

const SETTINGS = "update job_settings set tax_bp = 2000, lead_bp = 0, shares = '{\"scott\":4000,\"tom\":4000,\"ben\":2000}'";
before(async () => { saved = (await pool.query('select tax_bp, lead_bp, shares from job_settings')).rows[0]; await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, paid_out, expenses restart identity cascade'); await pool.query(SETTINGS); });
/* Settings put back exactly as found: other test files read them. */
let saved;
after(async () => { await pool.query('update job_settings set tax_bp = $1, lead_bp = $2, shares = $3::jsonb', [saved.tax_bp, saved.lead_bp, saved.shares ? JSON.stringify(saved.shares) : null]); await pool.end(); });

test('dates: month ends as HMRC counts them; the first long year is two tax periods; Companies House dates match', () => {
  assert.equal(A.addMonths('2027-11-30', 9), '2028-08-31');
  assert.equal(A.addMonths('2026-11-10', 21), '2028-08-10');
  assert.equal(A.addMonths('2028-01-31', 1), '2028-02-29');
  assert.deepEqual(A.taxPeriods({ from: '2026-11-10', to: '2027-11-30' }), [{ from: '2026-11-10', to: '2027-11-09' }, { from: '2027-11-10', to: '2027-11-30' }]);
  assert.equal(A.taxPeriods({ from: '2027-12-01', to: '2028-11-30' }).length, 1);
  const d = Object.fromEntries(A.keyDates('2026-11-20').map((x) => [x.what, x.day]));
  assert.equal(d['Confirmation statement'], '2027-11-23');
  assert.equal(d['Accounts to Companies House'], '2028-08-10');
  assert.equal(d['Corporation tax to pay (first period)'], '2028-08-10');
  assert.equal(d['Corporation tax to pay (second period)'], '2028-09-01');
  assert.equal(d['Corporation tax return (second period)'], '2028-11-30');
  const later = Object.fromEntries(A.keyDates('2028-01-10').map((x) => [x.what, x.day]));
  assert.equal(later['Corporation tax to pay'], '2029-09-01');
  assert.equal(later['Accounts to Companies House'], '2029-08-31');
});

test('checks: dividends over profit after tax and a director paid ahead are raised; the file escapes formulas', async () => {
  const job = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence,
      date_set, job_date, job_time, paid_at, deposit_paid_at, tax_bp, lead_bp, lead_earner, partner_a, partner_b, shares)
    values ('dampscan', 'completed', '=HYPERLINK("x")', 'ME19 6AB', 'full-house', 29500, 'ronnie', 13000, true, current_date - 1, '10:00', now(), now(), 2000, 0, 'scott', 'tom', 'ben', '{"scott":4000,"tom":4000,"ben":2000}') returning id`)).rows[0].id);
  await pool.query("insert into job_payments (job_id, amount_pence, label, external_ref, fee_pence) values ($1, 29500, 'payment', 'stripe:pi_z', 464)", [job]);
  await pool.query("insert into paid_out (person_key, amount_pence, paid_on, how, book) values ('scott', 90000, current_date, 'Dividend', 'new')");
  await pool.query("insert into expenses (spent_on, amount_pence, category, what) values (current_date, 1999, 'Software', 'No receipt here')");
  const a = await A.accountantChecks({});
  const says = a.checks.map((c) => c.text).join(' | ');
  assert.match(says, /Dividends £900 are more than the profit after tax/);
  assert.match(says, /Scott has been paid .* ahead of his share/);
  assert.ok((await A.accountantView({})).questions.some((q) => /director's loan or a dividend/.test(q)));
  assert.match(says, /1 cost with no receipt/);
  const v = await A.accountantView({});
  assert.ok(v.questions.some((q) => /dividend vouchers/.test(q)));
  assert.ok(v.dates.length >= 5);

  const csv = await C.accountsCsv({ from: '2026-01-01' });
  assert.ok(csv.startsWith('Section,Date,'));
  assert.match(csv, /Income,\d{4}-\d{2}-\d{2},"'=HYPERLINK\(""x""\), ME19 6AB",Survey \d+,295\.00,4\.64,Paid via Stripe/);
  assert.match(csv, /Cost,.*,Software,,-19\.99,,No receipt here; no receipt/);
  assert.match(csv, /Paid out,.*,Scott,Dividend,-900\.00/);
  assert.match(csv, /Summary,,Profit,/);
});
