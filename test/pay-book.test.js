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

test('two books: Revolut before 15 Nov, Tide and Stripe from then, each with its own balance and where the money came in', async () => {
  const old = await survey();
  await pool.query("update jobs set paid_at = '2026-11-10T12:00:00Z' where id = $1", [old]);
  const card = await survey();
  await pool.query("update jobs set paid_at = '2026-11-16T12:00:00Z' where id = $1", [card]);
  await pool.query("insert into job_payments (job_id, amount_pence, label, external_ref) values ($1, 29500, 'payment', 'stripe:pi_9')", [card]);
  const tide = await survey();
  await pool.query("update jobs set paid_at = '2026-11-16T15:00:00Z' where id = $1", [tide]);
  await survey({ paid: false });
  await P.recordPayout({ who: 'ronnie', pence: 4000, day: '2026-11-01', how: 'Bank transfer' }, 'Scott');
  /* Settling the old Revolut balance today stays in the Revolut book. */
  await P.recordPayout({ who: 'ronnie', pence: 1000, day: '2026-11-16', how: 'Bank transfer', book: 'old' }, 'Scott');
  await P.recordPayout({ who: 'ronnie', pence: 2500, day: '2026-11-16', how: 'Bank transfer' }, 'Scott');

  const now = await P.payBook();
  const r = now.cards.find((c) => c.key === 'ronnie');
  assert.equal(now.book, 'new');
  assert.deepEqual([r.owed, r.coming], [2 * 10000 - 2500, 10000], 'fresh from the cut-over, the unpaid one coming');
  assert.deepEqual(now.rows.filter((s) => s.paid).map((s) => s.via).sort(), ['Stripe', 'Tide']);
  assert.equal(now.other.owed > 0, true, 'the Revolut book still owes, said in one line');
  const was = await P.payBook({ book: 'old' });
  assert.equal(was.cards.find((c) => c.key === 'ronnie').owed, 10000 - 4000 - 1000);
  assert.deepEqual(was.rows.map((s) => s.via), ['Revolut']);
  assert.equal(was.check.in, was.check.out);

  const s = await P.statement('ronnie');
  assert.equal(s.owed, 17500);
  assert.equal(s.old.owed, 5000, 'each book its own running balance');
  assert.deepEqual(s.coming.map((c) => c.pence), [10000]);
  assert.ok(s.lines.every((l) => ['Stripe', 'Tide'].includes(l.via)));
  assert.ok(s.old.lines.every((l) => l.via === 'Revolut'));
});

test('a tick by hand on the cut-over evening is Revolut money caught up; a card payment that day is the new book', async () => {
  const caught = await survey();
  await pool.query("update jobs set paid_at = '2026-11-15T19:15:00Z' where id = $1", [caught]);
  const card = await survey();
  await pool.query("update jobs set paid_at = '2026-11-15T18:27:00Z' where id = $1", [card]);
  await pool.query("insert into job_payments (job_id, amount_pence, label, external_ref) values ($1, 29500, 'payment', 'stripe:pi_15')", [card]);
  const rows = await P.surveysDone(await P.splitSettings());
  assert.equal(rows.find((r) => r.id === caught).book, 'old');
  assert.deepEqual([rows.find((r) => r.id === card).book, rows.find((r) => r.id === card).via], ['new', 'Stripe']);
});

test('the split from go-live: new-book surveys take the shares, the Revolut book keeps the old waterfall, and saving checks they add up', async () => {
  const A = { scott: 4000, tom: 4000, ben: 2000 };
  await pool.query('update job_settings set shares = $1::jsonb', [JSON.stringify(A)]);
  const old = await survey({ surveyor: 'tom' });
  await pool.query("update jobs set paid_at = '2026-11-10T12:00:00Z' where id = $1", [old]);
  const fresh = await survey({ surveyor: 'tom', paid: false });
  const card = await survey({ surveyor: 'tom' });
  await pool.query("update jobs set paid_at = '2026-11-14T12:00:00Z' where id = $1", [card]);
  await pool.query("insert into job_payments (job_id, amount_pence, label, external_ref) values ($1, 29500, 'payment', 'stripe:pi_go')", [card]);
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const sh = Object.fromEntries((await pool.query('select id, shares from jobs')).rows.map((r) => [r.id, r.shares]));
  assert.equal(sh[old], null, 'paid into Revolut before the cut-over: as it was paid');
  assert.deepEqual([sh[fresh], sh[card]], [A, A]);
  const row = (await P.payBook()).rows.find((r) => r.id === fresh);
  assert.deepEqual(row.share, { tax: 5900, scott: 5440, tom: 10000 + 5440, ben: 2720, ronnie: 0 });

  assert.ok((await P.setSplit({ taxBp: 2000, shares: { scott: 4500, tom: 3500, ben: 2000 } })).ok);
  assert.deepEqual((await P.splitSettings()).shares, { scott: 4500, tom: 3500, ben: 2000 });
  assert.match((await P.setSplit({ taxBp: 2000, shares: { scott: 4500, tom: 4000, ben: 2000 } })).error, /add up to 100%/);
  await pool.query('update job_settings set shares = $1::jsonb', [JSON.stringify(A)]);
});

test('a survey repriced after booking has its stored split brought up to date', async () => {
  const { syncPay } = await import('../lib/pay-sync.js');
  const id = await survey({ price: 71500, fee: 19000, surveyor: 'tom' });
  await pool.query(`update jobs set shares = '{"scott": 4000, "tom": 4000, "ben": 2000}', pay_scott_pence = 5400, pay_tom_pence = 24800, pay_ben_pence = 5800 where id = $1`, [id]);
  assert.equal((await syncPay()).fixed, 1);
  const j = (await pool.query('select pay_scott_pence s, pay_tom_pence t, pay_ben_pence b from jobs where id = $1', [id])).rows[0];
  assert.deepEqual([j.s, j.t, j.b].map(Number), [15280, 34280, 7640]);
  assert.equal((await syncPay()).fixed, 0, 'a quiet run writes nothing');
});
