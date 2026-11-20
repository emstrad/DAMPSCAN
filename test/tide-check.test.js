/**
 * The monthly bank check (the owners' plan, 15 Nov 2026): Tide's statement
 * read whatever its columns are called, each line put beside the logbook, and
 * what is left over listed to put right.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const T = await import('../lib/tide-check.js');
const M = await import('../lib/company-money.js');
const P = await import('../lib/pay-book.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, paid_out, expenses restart identity cascade'); });
after(async () => { await pool.end(); });

test('dates and columns as Tide (and banks like it) write them', () => {
  assert.equal(T.tideDay('2026-11-03'), '2026-11-03');
  assert.equal(T.tideDay('03/11/2026'), '2026-11-03');
  assert.equal(T.tideDay('03-11-2026'), '2026-11-03');
  assert.equal(T.tideDay('3 Nov 2026'), '2026-11-03');
  const a = T.tideLines('Date,Transaction description,Reference,Paid in,Paid out\n03/11/2026,GOOGLE ADS,,,"1,200.50"\n04/11/2026,K LEE,KIM0042,107.50,\n');
  assert.deepEqual(a.lines.map((l) => [l.day, l.pence, l.what]), [['2026-11-03', -120050, 'GOOGLE ADS'], ['2026-11-04', 10750, 'K LEE']]);
  const b = T.tideLines('Date,Description,Amount\n2026-11-05,Fee,-5.00\n2026-11-05,Fee,-5.00\n');
  assert.notEqual(b.lines[0].ref, b.lines[1].ref, 'two identical lines stay two');
  assert.match(b.lines[0].ref, /^[a-f0-9]{32}$/);
  assert.ok(T.tideLines('Name,Colour\nKim,Blue\n').error);
  assert.equal(T.guessOut('TRANSFER TO SCOTT ELSON'), 'pay:scott:Bank transfer');
  assert.equal(T.guessOut('HMRC CORPORATION TAX'), 'pay:tax:Paid to HMRC');
  assert.equal(T.guessOut('GOOGLE *ADS1234'), 'cost:Google Ads');
});

test('each line beside the logbook; what is left over listed; putting one right matches it next time', async () => {
  const job = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence,
      date_set, job_date, job_time, tax_bp, lead_bp, lead_earner, partner_a, partner_b) values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', 'full-house', 21500, 'ronnie', 10000, true, '2026-11-10', '10:00', 2000, 1500, 'scott', 'tom', 'ben') returning id`)).rows[0].id);
  await M.addExpense({ pence: 2999, day: '2026-11-02', category: 'Software' }, 'Scott');
  await P.recordPayout({ who: 'tom', pence: 50000, day: '2026-11-20', how: 'Cash' }, 'Scott');
  await P.recordPayout({ who: 'ben', pence: 8000, day: '2026-11-15', how: 'Bank transfer' }, 'Scott');
  const ref = `KIM${String(job).padStart(4, '0')}`;
  const csv = `Date,Transaction description,Reference,Paid in,Paid out
01/11/2026,VERCEL INC,,,29.99
04/11/2026,K LEE,${ref},107.50,
06/11/2026,STRIPE PAYMENTS UK,,412.30,
07/11/2026,GOOGLE ADS,,,250.00
21/11/2026,UNKNOWN PAYER,,40.00,
`;
  const c = await T.tideCheck(csv);
  const by = (w) => c.lines.find((l) => l.what === w);
  assert.equal(by('VERCEL INC').status, 'matched', 'an expense of the same amount within five days');
  assert.equal(by('K LEE').status, 'auto', 'their own reference: reconciled at upload');
  assert.equal(by('K LEE').survey.id, job);
  assert.deepEqual(by('K LEE').ticked, ['deposit']);
  const j = (await pool.query("select (deposit_paid_at at time zone 'Europe/London')::date::text as d, paid_at from jobs where id = $1", [job])).rows[0];
  assert.deepEqual([j.d, j.paid_at], ['2026-11-04', null], 'dated the day the money arrived');
  assert.equal(by('STRIPE PAYMENTS UK').status, 'payout');
  assert.equal(by('GOOGLE ADS').status, 'missing');
  assert.equal(by('GOOGLE ADS').guess, 'cost:Google Ads');
  assert.equal(by('UNKNOWN PAYER').status, 'unknown');
  assert.deepEqual(c.notOnStatement.map((x) => x.label), ['Ben: Bank transfer'], 'cash is never expected on the statement');
  assert.equal(c.totals.in, 10750 + 41230 + 4000);
  assert.equal(c.totals.out, 2999 + 25000);

  await M.addExpense({ pence: 25000, day: '2026-11-07', category: 'Google Ads', bankRef: by('GOOGLE ADS').ref }, 'Scott');
  const again = await T.tideCheck(csv);
  assert.equal(again.lines.find((l) => l.what === 'GOOGLE ADS').status, 'matched');
  assert.equal(again.lines.find((l) => l.what === 'K LEE').status, 'reconciled', 'the same file again records nothing twice');
  assert.equal(Number((await pool.query('select count(*) from job_payments where job_id = $1', [job])).rows[0].count), 1);
});

test('a transfer without their reference: suggested, OK records it and ticks, Undo takes back only what it set', async () => {
  const R = await import('../lib/tide-reconcile.js');
  const job = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence,
      date_set, job_date, job_time, tax_bp, lead_bp, lead_earner, partner_a, partner_b) values ('ati-london', 'booked', 'Danya Smith', 'SE4 1XZ', 'full-house', 29500, 'tom', 13000, true, '2026-11-19', '09:00', 2000, 1500, 'scott', 'tom', 'ben') returning id`)).rows[0].id);
  const csv = 'Date,Transaction description,Reference,Paid in,Paid out\n16/11/2026,D SMITH,survey,147.50,\n';
  const c = await T.tideCheck(csv, 'Scott');
  const l = c.lines[0];
  assert.equal(l.status, 'suggest');
  assert.equal(l.survey.id, job);
  assert.ok(c.open.some((s) => s.id === job), 'and every survey still owed to find another');
  const r = await R.reconcile(l, job, 'Scott');
  assert.deepEqual(r.ticked, ['deposit']);
  assert.equal((await T.tideCheck(csv)).lines[0].status, 'reconciled');
  const hist = (await pool.query('select sched_log from jobs where id = $1', [job])).rows[0].sched_log;
  assert.match(hist.at(-1).note, /£147\.50 into Tide on 16\/11\/2026 \(ref survey\) matched by Scott: deposit paid\./);
  assert.ok((await R.unreconcile(l.ref, 'Scott')).ok);
  const after = (await pool.query('select deposit_paid_at from jobs where id = $1', [job])).rows[0];
  assert.equal(after.deposit_paid_at, null, 'the tick it set is taken back');
  assert.equal((await T.tideCheck(csv)).lines[0].status, 'suggest');
  /* A hand tick is never taken back by Undo. */
  await pool.query('update jobs set deposit_paid_at = now() where id = $1', [job]);
  await R.reconcile(l, job, 'Scott'); await R.unreconcile(l.ref, 'Scott');
  assert.ok((await pool.query('select deposit_paid_at from jobs where id = $1', [job])).rows[0].deposit_paid_at);
});

test('Tide status, savings moves and refunds: cancelled set aside, pending waits, savings counted into the tax pot in one tap', async () => {
  const csv = `"Date","Transaction ID","Transaction description","Reference","From","To","Paid in","Paid out","Category name","Transaction type","Status"
"2026-11-20 17:33:46","'a1","Google ADS5170768292   Dublin","","","Google ADS","","10.00","Marketing","CardPaymentOut","Pending"
"2026-11-20 15:20:11","'a2","Savings account ref:","","Savings account","","10.00","","Transfers","FundsTransferIn","Cleared"
"2026-11-20 12:48:35","'a3","Savings account ref:","","","Savings account","","495.00","Transfers","FundsTransferOut","Cleared"
"2026-11-18 10:00:00","'a4","Amazon Marketplace","","","Amazon","","24.99","Shopping","CardPaymentOut","Cleared"
"2026-11-19 10:00:00","'a5","Amazon Marketplace refund","","Amazon","","24.99","","Shopping","CardRefund","Cleared"
"2026-11-19 11:00:00","'a6","Shell Ashford","","","Shell","","60.00","Fuel","CardPaymentOut","Declined"
`;
  const c = await T.tideCheck(csv);
  assert.deepEqual(c.lines.map((l) => l.status), ['pending', 'savings', 'savings', 'refund', 'refund', 'void']);
  assert.equal(c.totals.out, 1000 + 49500 + 2499, 'a declined line moved no money');
  assert.equal(c.totals.pending, 1);
  assert.equal(c.totals.toSavings, 49500);
  assert.equal(c.totals.fromSavings, 1000);
  assert.equal(c.totals.matched, 4, 'savings and refunds need nothing');

  /* Counted as the tax pot: recorded on Pay from that line, and matched to it next time. */
  const move = c.lines[2];
  await P.recordPayout({ who: 'tax', pence: 49500, day: move.day, how: 'Moved to tax savings', note: 'Tide savings', bankRef: move.ref }, 'Scott');
  const again = await T.tideCheck(csv);
  assert.equal(again.lines[2].status, 'matched');
  assert.match(again.lines[2].logbook.label, /Corp tax/);
});
