/**
 * The pay logbook (the owners' brief, 15 Nov 2026): a survey counts once paid
 * in full, card fees come off the top, the shares follow each job's own rates,
 * payments out come off the owed figure, and everything adds up.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const P = await import('../lib/pay-book.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, paid_out restart identity cascade'); await pool.query("update job_settings set tax_bp = 2000, lead_bp = 1500, lead_earner = 'scott', partner_a = 'tom', partner_b = 'ben'"); });
after(async () => { await pool.query("update job_settings set tax_bp = 2000, lead_bp = 1500, lead_earner = 'scott', partner_a = 'tom', partner_b = 'ben'"); await pool.end(); });

async function survey({ price = 29500, fee = 10000, surveyor = 'ronnie', paid = true, days = -3, status = 'booked' } = {}) {
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence,
      date_set, job_date, job_time, paid_at, deposit_paid_at, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('dampscan', $1, 'Kim Lee', 'ME19 6AB', 'full-house', $2, $3, $4, true, current_date + $5::int, '10:00', $6, $6, 2000, 1500, 'scott', 'tom', 'ben') returning id`,
    [status, price, surveyor, fee, days, paid ? new Date() : null])).rows[0].id);
  return id;
}

test('a paid survey splits by its own rates, after card fees, and adds up to the penny', async () => {
  const id = await survey();
  await pool.query("insert into job_payments (job_id, amount_pence, label, external_ref, fee_pence) values ($1, 29500, 'payment', 'stripe:pi_1', 470)", [id]);
  const b = await P.payBook();
  const row = b.rows[0];
  const net = 29500 - 470, tax = Math.round(net * 0.2), lead = Math.round((net - tax) * 0.15), rest = net - tax - lead - 10000;
  assert.deepEqual(row.share, { tax, scott: lead, tom: rest - Math.trunc(rest / 2), ben: Math.trunc(rest / 2), ronnie: 10000 });
  assert.equal(b.check.in, b.check.out, 'every penny in is shared out');
  assert.equal(b.cards.find((c) => c.key === 'ronnie').owed, 10000);
});

test('unpaid work is coming, not owed; a cancelled survey drops out', async () => {
  await survey({ paid: false });
  await survey({ status: 'cancelled' });
  const b = await P.payBook();
  const ronnie = b.cards.find((c) => c.key === 'ronnie');
  assert.deepEqual([ronnie.owed, ronnie.coming], [0, 10000]);
  assert.equal(b.rows.length, 1, 'the cancelled one is not in the logbook');
});

test('a payment comes off what is owed, shows on the statement, and can be removed', async () => {
  await survey();
  const r = await P.recordPayout({ who: 'ronnie', pence: 6000, day: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), how: 'Bank transfer' }, 'Scott');
  assert.ok(r.ok);
  assert.equal((await P.payBook()).cards.find((c) => c.key === 'ronnie').owed, 4000);
  const s = await P.statement('ronnie');
  assert.deepEqual(s.lines.map((l) => [l.kind, l.pence, l.balance]), [['paid', -6000, 4000], ['earned', 10000, 10000]]);
  await P.removePayout(r.id, 'Scott');
  assert.equal((await P.payBook()).cards.find((c) => c.key === 'ronnie').owed, 10000);
  assert.ok((await P.recordPayout({ who: 'nobody', pence: 100 })).error);
});

test('the split for new surveys is the owners\' to change, and checked', async () => {
  assert.ok((await P.setSplit({ taxBp: 1900, leadBp: 1500, leadEarner: 'scott', partnerA: 'scott', partnerB: 'tom' })).ok);
  assert.equal((await P.splitSettings()).taxBp, 1900);
  assert.ok((await P.setSplit({ taxBp: 1900, leadBp: 1500, leadEarner: 'scott', partnerA: 'tom', partnerB: 'tom' })).error);
  assert.ok((await P.setSplit({ taxBp: 20000, leadBp: 1500, leadEarner: 'scott', partnerA: 'scott', partnerB: 'tom' })).error);
});
