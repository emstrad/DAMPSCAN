/**
 * Company, Money (the owners' plan, 15 Nov 2026): corporation tax on real
 * profit with marginal relief, costs from shares, fees, salaries and the
 * expenses log, and the expenses themselves.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const M = await import('../lib/company-money.js');

const SETTINGS = "update job_settings set tax_bp = 2000, lead_bp = 1500, lead_earner = 'scott', partner_a = 'tom', partner_b = 'ben'";
before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, paid_out, expenses restart identity cascade'); await pool.query(SETTINGS); });
after(async () => { await pool.query(SETTINGS); await pool.end(); });

async function survey(price = 29500, fee = 10000) {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence,
      date_set, job_date, job_time, paid_at, deposit_paid_at, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('dampscan', 'completed', 'Kim Lee', 'ME19 6AB', 'full-house', $1, 'ronnie', $2, true, current_date - 2, '10:00', now(), now(), 2000, 1500, 'scott', 'tom', 'ben') returning id`,
    [price, fee])).rows[0].id);
}

test('corporation tax: 19% small, 25% main, marginal relief between', () => {
  assert.equal(M.corpTax(0), 0);
  assert.equal(M.corpTax(-5000), 0);
  assert.equal(M.corpTax(4000000), 760000);
  assert.equal(M.corpTax(30000000), 7500000);
  /* £100,000: 25% less 3/200 of (£250,000 - £100,000) = £25,000 - £2,250. */
  assert.equal(M.corpTax(10000000), 2275000);
  assert.equal(M.marginalRate(10000000), 0.265);
  assert.equal(M.yearStart('2026-11-15'), '2025-12-01');
  assert.equal(M.yearStart('2026-12-02'), '2026-12-01');
});

test('costs: Ronnie and Ben shares, card fees, salaries and expenses; profit is what is left', async () => {
  const id = await survey();
  await pool.query("insert into job_payments (job_id, amount_pence, label, external_ref, fee_pence) values ($1, 29500, 'payment', 'stripe:pi_m', 470)", [id]);
  await pool.query("insert into paid_out (person_key, amount_pence, paid_on, how) values ('scott', 104750, current_date, 'Salary'), ('tom', 5000, current_date, 'Dividend')");
  assert.equal((await M.addExpense({ pence: 2500, category: 'Google Ads', what: 'Week 46' }, 'Scott')).ok, true);
  const v = await M.moneyView({ from: null });
  const by = Object.fromEntries(v.period.costs.map((c) => [c.name, c.pence]));
  assert.equal(by.Ronnie, 10000);
  assert.ok(by.Ben > 0);
  assert.equal(by['Card fees'], 470);
  assert.equal(by.Salaries, 104750, 'a dividend is not a cost');
  assert.equal(by['Google Ads'], 2500);
  assert.equal(v.period.in, 29500);
  assert.equal(v.period.profit, 29500 - v.period.cost);
  assert.equal(v.tax.estimate, M.corpTax(v.tax.profit));
  assert.equal(v.expenses.length, 1);
  assert.ok(v.ideas.length >= 3 && v.ideas.every((i) => i.saves > 0));
});

test('expenses: a sensible amount and category, our own receipt paths only, removed with who', async () => {
  assert.ok((await M.addExpense({ pence: 0, category: 'Software' })).error);
  assert.ok((await M.addExpense({ pence: 100, category: 'Holidays' })).error);
  const r = await M.addExpense({ pence: 999, category: 'Software', receipt: '../../etc/passwd' }, 'Tom');
  assert.equal((await pool.query('select receipt_path from expenses where id = $1', [r.id])).rows[0].receipt_path, null);
  const ok = await M.addExpense({ pence: 999, category: 'Software', receipt: 'leads/2026-11-15/abc-def-receipt.pdf' }, 'Tom');
  assert.equal((await pool.query('select receipt_path from expenses where id = $1', [ok.id])).rows[0].receipt_path, 'leads/2026-11-15/abc-def-receipt.pdf');
  assert.equal((await M.removeExpense(ok.id, 'Tom')).ok, true);
  assert.ok((await M.removeExpense(ok.id, 'Tom')).error);
  assert.equal((await M.moneyView({})).expenses.length, 1);
});
