/**
 * The ticks and the owed alerts follow the money as the customer's page does
 * (the owner, 18 Nov 2026): a price change re-checks deposit and paid in full,
 * and every owed figure counts bank lines and what a tick stood for.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const { scopeFor } = await import('../lib/access.js');
const { changeSurvey } = await import('../lib/survey-change.js');
const { owed } = await import('../lib/due-sections.js');
const { moneyOf } = await import('../lib/portal-view.js');
const { moneyCols } = await import('../lib/money-sql.js');
const owners = () => scopeFor({ person: false, name: 'Owners' });

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, job_payments, bank_transactions, bank_statements, audit restart identity cascade'); });
after(async () => { await pool.end(); });

const job = async (price, f = {}) => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time,
    deposit_paid_at, paid_at, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
  values ('ati-london', $1, 'Kim Lee', 'SE4 2EB', null, $2, 'tom', 13000, true, current_date + $3::int, '10:00', $4, $5, 2000, 1500, 'scott', 'tom', 'ben') returning id`,
  [f.status || 'booked', price, f.days ?? 5, f.deposit ? new Date() : null, f.paid ? new Date() : null])).rows[0].id);
const pay = (id, pence) => pool.query(`insert into job_payments (job_id, amount_pence, label, paid_on) values ($1, $2, 'deposit', current_date)`, [id, pence]);
const bank = async (id, pence, fp) => {
  const st = (await pool.query("insert into bank_statements (books, filename) values ('damp', 'x.csv') returning id")).rows[0].id;
  await pool.query(`insert into bank_transactions (statement_id, books, fingerprint, posted_on, description, amount_pence, job_id) values ($1, 'damp', $2, current_date, 'KIM', $3, $4)`, [st, fp, pence, id]);
};
const row = async (id) => (await pool.query(`select ${moneyCols('j')} from jobs j where j.id = $1`, [id])).rows[0];
const ticks = async (id) => { const r = await row(id); return { deposit: Boolean(r.deposit_paid_at), paid: Boolean(r.paid_at), m: moneyOf(r) }; };

test('a rise after a deposit paid by card takes the tick off; the page asks for the rest', async () => {
  const id = await job(21500, { deposit: true });
  await pay(id, 10750);
  const r = await changeSurvey(await owners(), id, { pricePounds: 495 });
  const t = await ticks(id);
  assert.equal(t.deposit, false, 'no longer "Deposit in" on Today and the lists');
  assert.equal(t.m.paidPence, 10750, 'the card money still counts');
  assert.equal(t.m.minNowPence, 24750 - 10750);
  assert.match(r.said, /deposit is now short: £140 more is due/);
});

test('a rise after paid in full by hand keeps what the tick stood for, as a deposit', async () => {
  const id = await job(29500, { deposit: true, paid: true });
  const r = await changeSurvey(await owners(), id, { pricePounds: 495 });
  const t = await ticks(id);
  assert.deepEqual([t.paid, t.deposit], [false, true]);
  assert.equal(t.m.paidPence, 29500, 'the £295 ticked is never lost');
  assert.equal(t.m.balancePence, 20000);
  assert.match(r.said, /No longer paid in full: £200 still to pay/);
});

test('a drop to what is already in ticks paid in full; a drop to the deposit ticks the deposit', async () => {
  const a = await job(29500);
  await pay(a, 21500);
  await changeSurvey(await owners(), a, { pricePounds: 215 });
  assert.equal((await ticks(a)).paid, true);
  const b = await job(49500);
  await bank(b, 15000, 'fp1');
  const r = await changeSurvey(await owners(), b, { pricePounds: 295 });
  const t = await ticks(b);
  assert.deepEqual([t.deposit, t.paid], [true, false], 'a bank transfer counts as their page counts it');
  assert.match(r.said, /The deposit is now covered\./);
});

test('the owed list counts bank lines and the deposit a tick stood for, as the page does', async () => {
  const id = await job(29500, { status: 'completed', days: -3, deposit: true });
  await pool.query('update jobs set survey_price_pence = 49500 where id = $1', [id]);
  await bank(id, 20000, 'fp2');
  const o = (await owed(['ati-london'])).find((x) => x.id === id);
  assert.equal(o.owedPence, moneyOf(await row(id)).balancePence);
  assert.equal(o.owedPence, 49500 - 20000);
});
