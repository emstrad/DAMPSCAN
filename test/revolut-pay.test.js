/**
 * Paying online through Revolut (the owners' plan, 11 Nov 2026): the amount
 * is checked on the server, a payment is recorded only when Revolut itself
 * says the order is complete, once, and it ticks, texts and alerts.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'revolut-secret-long-enough-xxxxxxxxxxx';
process.env.IP_SALT = 'revolut-salt';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const R = await import('../lib/revolut-pay.js');
const { buildView } = await import('../lib/portal-view.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, audit, notifications, sms_outbox, pay_orders, integration_keys restart identity cascade');
  process.env.REVOLUT_MERCHANT_KEY = 'sk_test';
});
after(async () => { await pool.end(); delete process.env.REVOLUT_MERCHANT_KEY; });

const DAY = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const job = async () => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_price_pence, date_set, job_date, job_time, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', '07700 900123', 29500, true, $1, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [DAY])).rows[0].id);
const row = async (id) => (await pool.query(`select j.*, j.job_date::text as job_day, 0 as paid_pence, 0 as refunded_pence from jobs j where id = $1`, [id])).rows[0];
/* A pretend Revolut: orders made, and their state when asked. */
function fake(states = {}) {
  const calls = [];
  const fetchImpl = async (url, o) => {
    calls.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null, version: o.headers['Revolut-Api-Version'] });
    if (o.method === 'POST' && url.endsWith('/api/orders')) return { ok: true, json: async () => ({ id: 'ord_1', checkout_url: 'https://checkout.revolut.com/pay/abc', state: 'pending' }) };
    const id = url.split('/').pop();
    return { ok: true, json: async () => ({ id, state: states[id] || 'pending', amount: 14750 }) };
  };
  return { calls, fetchImpl };
}

test('a payment is checked on the server: at least the deposit, at most the balance', async () => {
  const id = await job(); const j = await row(id); const v = buildView(j);
  const f = fake();
  assert.equal((await R.startPayment(j, v, 1000, { returnUrl: 'https://x', fetchImpl: f.fetchImpl })).error, 'amount', 'under the deposit');
  assert.equal((await R.startPayment(j, v, 30000, { returnUrl: 'https://x', fetchImpl: f.fetchImpl })).error, 'amount', 'over the price');
  const ok = await R.startPayment(j, v, 14750, { returnUrl: 'https://dampscan.co.uk/my.html?t=x&paid=1', fetchImpl: f.fetchImpl });
  assert.equal(ok.url, 'https://checkout.revolut.com/pay/abc');
  assert.equal(f.calls[0].body.amount, 14750);
  assert.equal(f.calls[0].body.merchant_order_data.reference, `KIM${String(id).padStart(4, '0')}`);
  assert.equal(f.calls[0].version, '2025-12-04');
  delete process.env.REVOLUT_MERCHANT_KEY;
  assert.equal((await R.startPayment(j, v, 14750, { returnUrl: 'x', fetchImpl: f.fetchImpl })).error, 'off');
});

test('only Revolut saying complete records it, once, ticking the deposit and texting at once', async () => {
  const id = await job(); const j = await row(id);
  const f = fake();
  await R.startPayment(j, buildView(j), 14750, { returnUrl: 'x', fetchImpl: f.fetchImpl });
  assert.equal((await R.onWebhook({ event: 'ORDER_COMPLETED', order_id: 'ord_1' }, {}, { fetchImpl: f.fetchImpl })).status, 200);
  assert.equal((await pool.query('select count(*)::int as n from job_payments where job_id = $1', [id])).rows[0].n, 0, 'still pending at Revolut: nothing recorded');
  const done = fake({ ord_1: 'completed' });
  await R.onWebhook({ event: 'ORDER_COMPLETED', order_id: 'ord_1' }, {}, { fetchImpl: done.fetchImpl });
  assert.deepEqual(await R.latestOrder(id, { fetchImpl: done.fetchImpl }), { state: 'completed', pence: 14750 }, 'coming back to the page at the same time changes nothing');
  const pays = (await pool.query('select amount_pence, label from job_payments where job_id = $1', [id])).rows;
  assert.deepEqual(pays.map((p) => [Number(p.amount_pence), p.label]), [[14750, 'deposit']]);
  assert.ok((await pool.query('select deposit_paid_at from jobs where id = $1', [id])).rows[0].deposit_paid_at);
  const text = (await pool.query('select kind, status from sms_outbox where job_id = $1', [id])).rows[0];
  assert.deepEqual([text.kind, text.status], ['paid', 'off'], 'the payment text went straight away (texts are off in tests)');
  assert.equal((await pool.query("select count(*)::int as n from notifications where kind = 'payment'")).rows[0].n, 1);
  assert.deepEqual(await R.onWebhook({ event: 'ORDER_COMPLETED', order_id: 'not_ours' }, {}, { fetchImpl: done.fetchImpl }), { status: 200 }, 'an order we never made is ignored');
});

test('a declined payment shows as declined when they come back', async () => {
  const id = await job(); const j = await row(id);
  const f = fake();
  await R.startPayment(j, buildView(j), 29500, { returnUrl: 'x', fetchImpl: f.fetchImpl });
  const failed = fake({ ord_1: 'failed' });
  assert.equal((await R.latestOrder(id, { fetchImpl: failed.fetchImpl })).state, 'failed');
  assert.equal((await pool.query('select count(*)::int as n from job_payments')).rows[0].n, 0);
});
