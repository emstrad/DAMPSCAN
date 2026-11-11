/**
 * The hourly money checks and the report controls (the owners' plan, 11 Nov
 * 2026): a cancelled survey owing money back, an overpayment and a deposit
 * not paid after 48 hours each make one to-do and move no money; a card
 * refund goes through Revolut once; a held report stays locked and quiet.
 */
process.env.SMS_QUIET_HOURS = 'off';
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'money-secret-long-enough-xxxxxxxxxxxxx';
process.env.IP_SALT = 'money-salt';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const M = await import('../lib/money-todos.js');
const { refundOnline } = await import('../lib/revolut-pay.js');
const { reportSets } = await import('../lib/survey-money.js');
const { buildView } = await import('../lib/portal-view.js');
const { textsAfterChange } = await import('../lib/texts.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, audit, notifications, sms_outbox, pay_orders restart identity cascade'); });
after(async () => { await pool.end(); delete process.env.REVOLUT_MERCHANT_KEY; });

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function job(over = {}) {
  const o = { status: 'booked', date: day(5), ...over };
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_price_pence, date_set, job_date, job_time, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', $1, 'Kim Lee', 'ME19 6AB', '07700 900123', 29500, true, $2, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [o.status, o.date])).rows[0].id);
}
const pay = (id, pence, ref = null) => pool.query(`insert into job_payments (job_id, amount_pence, label, external_ref) values ($1, $2, 'payment', $3)`, [id, pence, ref]);
const todos = async () => (await pool.query('select text from todos order by id')).rows.map((r) => r.text);
const row = async (id) => (await pool.query(`select j.*, j.job_date::text as job_day, coalesce((select sum(amount_pence) from job_payments where job_id = j.id and label <> 'refund'), 0) as paid_pence, 0 as refunded_pence from jobs j where id = $1`, [id])).rows[0];

test('cancelled 48 hours or more before: one to-do to refund it all; later: all but the deposit', async () => {
  const early = await job(); await pay(early, 29500);
  await pool.query(`update jobs set status = 'cancelled' where id = $1`, [early]);
  const late = await job({ date: day(1) }); await pay(late, 29500);
  await pool.query(`update jobs set status = 'cancelled', job_time = (now() at time zone 'Europe/London' + interval '3 hours')::time, job_date = (now() at time zone 'Europe/London' + interval '3 hours')::date where id = $1`, [late]);
  const none = await job(); await pool.query(`update jobs set status = 'cancelled' where id = $1`, [none]);
  assert.equal(await M.refundsDue(), 2);
  const t = await todos();
  assert.match(t[0], /^Refund Kim \(ME19\) £295: cancelled 48 hours or more before/);
  assert.match(t[1], /^Refund Kim \(ME19\) £147\.50: cancelled within 48 hours, so the deposit is kept/);
  assert.equal(await M.refundsDue(), 0, 'once only');
  const v = buildView(await row(late));
  assert.deepEqual([v.cancel.rule, v.cancel.keptPence, v.cancel.refundPence], ['kept', 14750, 14750]);
});

test('an overpayment and a deposit unpaid after 48 hours are each one to-do; the booking stays', async () => {
  const over = await job(); await pay(over, 30000);
  const owing = await job(); await pool.query(`update jobs set booked_at = now() - interval '49 hours' where id = $1`, [owing]);
  const fresh = await job();
  assert.equal(await M.overpaid(), 1);
  assert.equal(await M.depositChase(), 1);
  assert.equal(await M.depositChase(), 0, 'chased once');
  const t = await todos();
  assert.match(t[0], /^Kim \(ME19\) has paid £5 more than the price/);
  assert.match(t[1], /^Chase Kim \(ME19\) for the £147\.50 deposit: booked 2 days ago .* The booking stays\./);
  assert.equal((await pool.query('select status from jobs where id = $1', [owing])).rows[0].status, 'booked');
  assert.ok((await pool.query('select booked_at from jobs where id = $1', [fresh])).rows[0].booked_at, 'booked_at set when the date was set');
});

test('a card refund goes through Revolut against the orders paid, never more than paid by card', async () => {
  process.env.REVOLUT_MERCHANT_KEY = 'sk_test';
  const id = await job();
  await pool.query(`insert into pay_orders (order_id, job_id, amount_pence, state) values ('ord_a', $1, 14750, 'completed'), ('ord_b', $1, 14750, 'completed')`, [id]);
  const calls = [];
  const fetchImpl = async (url, o) => { calls.push([url, JSON.parse(o.body).amount]); return { ok: true, json: async () => ({ id: 'ref_' + calls.length }) }; };
  assert.deepEqual(await refundOnline(id, 40000, { fetchImpl }), { error: 'more_than_paid_online' });
  assert.deepEqual(await refundOnline(id, 20000, { fetchImpl, by: 'Scott' }), { refunded: 20000 });
  assert.equal(calls.length, 2, 'split across the two card payments');
  assert.ok(calls.every(([u]) => /\/api\/orders\/ord_[ab]\/refund$/.test(u)));
  assert.equal(calls.reduce((t, [, a]) => t + a, 0), 20000);
  const refunds = (await pool.query(`select sum(amount_pence)::int as s from job_payments where label = 'refund'`)).rows[0].s;
  assert.equal(refunds, -20000);
  assert.deepEqual(await refundOnline(id, 10000, { fetchImpl }), { error: 'more_than_paid_online' }, 'only £95 left on the cards');
});

test('two refunds tapped at once never refund more than was paid by card', async () => {
  process.env.REVOLUT_MERCHANT_KEY = 'sk_test';
  const id = await job();
  await pool.query(`insert into pay_orders (order_id, job_id, amount_pence, state) values ('ord_c', $1, 29500, 'completed')`, [id]);
  let n = 0;
  const fetchImpl = async () => { n += 1; await new Promise((r) => setTimeout(r, 20)); return { ok: true, json: async () => ({ id: 'ref_' + n }) }; };
  const both = await Promise.all([refundOnline(id, 20000, { fetchImpl }), refundOnline(id, 20000, { fetchImpl })]);
  const total = (await pool.query(`select coalesce(-sum(amount_pence), 0)::int as s from job_payments where label = 'refund'`)).rows[0].s;
  assert.equal(total, 20000, JSON.stringify(both));
  assert.equal(n, 1, 'Revolut asked once');
});

test('a held report stays locked and texts nothing; letting it go sends the ready text', async () => {
  const id = await job({ status: 'completed', date: day(-1) });
  await pool.query(`update jobs set report_path = 'r/x.pdf', report_name = 'x.pdf' where id = $1`, [id]);
  const apply = async (body) => { const { sets, params } = reportSets(body); await pool.query(`update jobs set ${sets.join(', ')} where id = $1`, [id, ...params]); };
  await apply({ ready: true, hold: true });
  assert.equal(buildView(await row(id)).state, 'writing', 'held: still being written as far as they know');
  assert.equal(buildView(await row(id)).report, null);
  await textsAfterChange(id, { delayMs: 0 });
  assert.equal((await pool.query('select count(*)::int as n from sms_outbox')).rows[0].n, 0, 'nothing texted while held');
  await apply({ hold: false });
  assert.equal(buildView(await row(id)).state, 'ready');
  await textsAfterChange(id, { delayMs: 0 });
  assert.deepEqual((await pool.query('select kind from sms_outbox')).rows.map((r) => r.kind), ['ready']);
});
