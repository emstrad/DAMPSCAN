/**
 * Money in on What's next (lib/money-in.js, the owner, 20 Nov 2026): every
 * payment of the last 30 days, newest first, each pound once. A card deposit
 * shows as the card payment, not again as its tick; a tick with nothing behind
 * it shows what it stood for; a refund shows as money out.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const { moneyIn, tickLines } = await import('../lib/money-in.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, job_payments restart identity cascade'); });
after(async () => { await pool.end(); });

const job = async (name, price = 29500) => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, date_set, job_date)
  values ('ati-london', 'booked', $1, 'SE4 1XZ', 'full-house', $2, 'tom', 0, 0, '', '', '', true, current_date + 3) returning id`, [name, price])).rows[0].id);

test('a card deposit, a hand tick for the balance and a refund: each pound once, newest first', async () => {
  const kim = await job('Kim Lee');
  await pool.query(`insert into job_payments (job_id, amount_pence, label, external_ref, created_at) values ($1, 14750, 'deposit', 'stripe:pi_1', now() - interval '2 hours')`, [kim]);
  await pool.query(`update jobs set deposit_paid_at = now() - interval '2 hours' where id = $1`, [kim]);
  await pool.query(`update jobs set paid_at = now() - interval '1 hour' where id = $1`, [kim]);
  const raj = await job('Raj Patel', 21500);
  await pool.query(`update jobs set deposit_paid_at = now() - interval '30 minutes' where id = $1`, [raj]);
  const amy = await job('Amy Fox');
  await pool.query(`insert into job_payments (job_id, amount_pence, label, external_ref, created_at) values ($1, -5000, 'refund', 'stripe-refund:re_1', now() - interval '10 minutes')`, [amy]);

  const m = await moneyIn(['ati-london']);
  assert.deepEqual(m.rows.map((r) => [r.name, r.kind, r.how, r.pence]), [
    ['Amy Fox', 'Refund', 'Card', -5000],
    ['Raj Patel', 'Deposit', 'Ticked by hand', 10750],
    ['Kim Lee', 'Balance', 'Ticked by hand', 14750],
    ['Kim Lee', 'Deposit', 'Card', 14750]
  ]);
  assert.equal(m.today, 14750 + 10750 + 14750 - 5000, 'the day\'s money, refunds off');
  assert.ok(m.rows.every((r) => r.jobId && r.day), 'every row opens its card');
});

test('a tick the money already covers adds nothing; old ticks stay out of the window', () => {
  const since = Date.now() - 30 * 86400000;
  const recent = new Date().toISOString();
  assert.deepEqual(tickLines({ deposit_paid_at: recent, tick_deposit_pence: 14750 }, 14750, since), []);
  assert.deepEqual(tickLines({ paid_at: recent, tick_paid_pence: 29500 }, 0, since).map((t) => [t.kind, t.pence]), [['Paid in full', 29500]]);
  assert.deepEqual(tickLines({ deposit_paid_at: '2026-01-01T00:00:00Z', tick_deposit_pence: 14750 }, 0, since), []);
});
