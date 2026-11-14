/**
 * Card, Apple Pay and Google Pay through Stripe Checkout (the owners' choice,
 * 14 Nov 2026): the amount is checked on the server, a payment is recorded
 * only when Stripe itself says the session is paid, once, with its fee, and
 * a refund goes back against that payment. A pretend Stripe answers here.
 */
process.env.SMS_QUIET_HOURS = 'off';
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'stripe-secret-long-enough-xxxxxxxxxxxx';
process.env.IP_SALT = 'stripe-salt';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const R = await import('../lib/revolut-pay.js');
const { form } = await import('../lib/stripe-pay.js');
const { buildView } = await import('../lib/portal-view.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, audit, notifications, sms_outbox, pay_orders, integration_keys restart identity cascade');
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  delete process.env.REVOLUT_MERCHANT_KEY;
});
after(async () => { await pool.end(); delete process.env.STRIPE_SECRET_KEY; });

const DAY = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const job = async () => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_price_pence, date_set, job_date, job_time, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', '07700 900123', 29500, true, $1, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [DAY])).rows[0].id);
const row = async (id) => (await pool.query(`select j.*, j.job_date::text as job_day, 0 as paid_pence, 0 as refunded_pence from jobs j where id = $1`, [id])).rows[0];

/* A pretend Stripe: sessions made, their state when asked, refunds. */
function fake(state = { status: 'open', payment_status: 'unpaid' }) {
  const calls = [];
  const fetchImpl = async (url, o) => {
    const body = o.body ? Object.fromEntries(new URLSearchParams(o.body)) : null;
    calls.push({ url, method: o.method, body, auth: o.headers.Authorization, idem: o.headers['Idempotency-Key'] });
    if (o.method === 'POST' && url.endsWith('/v1/checkout/sessions')) return { ok: true, json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }) };
    if (o.method === 'POST' && url.endsWith('/v1/refunds')) return { ok: true, json: async () => ({ id: 're_1' }) };
    if (o.method === 'POST' && url.endsWith('/v1/webhook_endpoints')) return { ok: true, json: async () => ({ id: 'we_1', secret: 'whsec_x' }) };
    return { ok: true, json: async () => ({ id: 'cs_test_1', amount_total: 14750, ...state,
      payment_intent: { id: 'pi_1', latest_charge: { balance_transaction: { fee: 241 } } } }) };
  };
  return { calls, fetchImpl };
}
const PAID = { status: 'complete', payment_status: 'paid' };

test('Stripe takes over when its key is in: the amount checked here, a session for exactly that', async () => {
  const id = await job(); const j = await row(id); const v = buildView(j);
  assert.equal(v.payOnline, true, 'the Pay button shows');
  const f = fake();
  assert.equal((await R.startPayment(j, v, 1000, { returnUrl: 'https://x', fetchImpl: f.fetchImpl })).error, 'amount', 'under the deposit');
  const ok = await R.startPayment(j, v, 14750, { returnUrl: 'https://dampscan.co.uk/my.html?t=x&paid=1', fetchImpl: f.fetchImpl });
  assert.deepEqual(ok, { url: 'https://checkout.stripe.com/c/pay/cs_test_1', orderId: 'cs_test_1' });
  const b = f.calls[0].body;
  assert.equal(f.calls[0].auth, 'Bearer sk_test_x');
  assert.equal(b['line_items[0][price_data][unit_amount]'], '14750');
  assert.equal(b['line_items[0][price_data][currency]'], 'gbp');
  assert.equal(b['metadata[reference]'], `KIM${String(id).padStart(4, '0')}`);
  assert.equal(b.success_url, 'https://dampscan.co.uk/my.html?t=x&paid=1');
  assert.equal(b.cancel_url, 'https://dampscan.co.uk/my.html?t=x', 'backing out is not "confirming"');
  assert.ok(f.calls[0].idem, 'a retried tap never makes two');
  assert.equal(b.payment_method_types, undefined, 'Apple Pay and Google Pay come from the dashboard settings');
});

test('only Stripe saying paid records it, once, with its fee, ticking the deposit', async () => {
  const id = await job(); const j = await row(id);
  await R.startPayment(j, buildView(j), 14750, { returnUrl: 'https://x&paid=1', fetchImpl: fake().fetchImpl });
  assert.deepEqual(await R.settleOrder('cs_test_1', { fetchImpl: fake().fetchImpl }), { state: 'pending' }, 'still open: nothing recorded');
  const paid = fake(PAID);
  assert.equal((await R.onWebhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1' } } }, {}, { fetchImpl: paid.fetchImpl })).status, 200);
  assert.match(paid.calls[0].url, /checkout\/sessions\/cs_test_1\?expand/, 'the notice is checked with Stripe itself');
  await R.onWebhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1' } } }, {}, { fetchImpl: paid.fetchImpl });
  const pays = (await pool.query('select amount_pence, label, external_ref, fee_pence from job_payments where job_id = $1', [id])).rows;
  assert.deepEqual(pays.map((p) => [Number(p.amount_pence), p.label, p.external_ref, Number(p.fee_pence)]), [[14750, 'deposit', 'stripe:cs_test_1', 241]]);
  assert.ok((await row(id)).deposit_paid_at, 'deposit ticked');
  assert.equal((await row(id)).paid_at, null, 'a deposit is not paid in full');
  assert.equal((await pool.query("select provider_ref from pay_orders where order_id = 'cs_test_1'")).rows[0].provider_ref, 'pi_1');
  assert.deepEqual(await R.onWebhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_not_ours' } } }, {}, { fetchImpl: paid.fetchImpl }), { status: 200 }, 'a session we never made is ignored');
  assert.deepEqual(await R.onWebhook({ type: 'charge.refunded', data: { object: { id: 'ch_1' } } }), { status: 200 }, 'other notices are ignored');
});

test('an expired session is "nothing was taken"; a card refund goes back against the payment', async () => {
  const id = await job(); const j = await row(id);
  await R.startPayment(j, buildView(j), 14750, { returnUrl: 'https://x&paid=1', fetchImpl: fake().fetchImpl });
  await R.settleOrder('cs_test_1', { fetchImpl: fake(PAID).fetchImpl });
  assert.equal(await R.refundableOnline(id), 14750);
  const f = fake(PAID);
  assert.deepEqual(await R.refundOnline(id, 5000, { by: 'Scott', fetchImpl: f.fetchImpl }), { refunded: 5000 });
  const call = f.calls.find((c) => c.url.endsWith('/v1/refunds'));
  assert.deepEqual([call.body.payment_intent, call.body.amount], ['pi_1', '5000']);
  assert.ok(call.idem);
  assert.equal(await R.refundableOnline(id), 9750);
  assert.equal((await R.refundOnline(id, 20000, { fetchImpl: f.fetchImpl })).error, 'more_than_paid_online');

  await pool.query("insert into pay_orders (order_id, job_id, amount_pence) values ('cs_test_2', $1, 14750)", [id]);
  assert.deepEqual(await R.settleOrder('cs_test_2', { fetchImpl: fake({ status: 'expired', payment_status: 'unpaid' }).fetchImpl }), { state: 'cancelled' });
});

test('Settings connects the notices to Stripe and keeps the signing secret', async () => {
  const f = fake();
  assert.deepEqual(await R.connectWebhook('https://dampscan.co.uk/api/quote?doc=stripe', { fetchImpl: f.fetchImpl }), { ok: true, id: 'we_1' });
  assert.equal(f.calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/webhook_endpoints')).body['enabled_events[0]'], 'checkout.session.completed');
  assert.equal((await pool.query("select value from integration_keys where name = 'stripe_webhook_secret'")).rows[0].value, 'whsec_x');
});

test('form fields nest the way Stripe reads them', () => {
  assert.equal(form({ a: 1, m: { k: 'v' }, l: [{ q: 2 }], skip: null }).toString(), 'a=1&m%5Bk%5D=v&l%5B0%5D%5Bq%5D=2');
});

test('50p on a £1 survey is the deposit, never paid in full (amounts compared as numbers, not text)', async () => {
  const id = await job();
  await pool.query('update jobs set survey_price_pence = 100 where id = $1', [id]);
  await pool.query("insert into pay_orders (order_id, job_id, amount_pence) values ('cs_small', $1, 50)", [id]);
  const f = fake(PAID);
  const real = f.fetchImpl;
  const fetchImpl = async (url, o) => (o.method === 'GET' || !o.method ? { ok: true, json: async () => ({ id: 'cs_small', amount_total: 50, status: 'complete', payment_status: 'paid', payment_intent: { id: 'pi_s' } }) } : real(url, o));
  await R.settleOrder('cs_small', { fetchImpl });
  const j = await row(id);
  assert.ok(j.deposit_paid_at, 'deposit ticked');
  assert.equal(j.paid_at, null, '50 is not >= 100');
});

test('the Apple Pay button on the page: same checks, a card-only payment, recorded only once Stripe says it succeeded', async () => {
  const id = await job(); const j = await row(id); const v = buildView(j);
  const calls = [];
  let status = 'requires_payment_method';
  const fetchImpl = async (url, o = {}) => {
    calls.push({ url, method: o.method, body: o.body ? Object.fromEntries(new URLSearchParams(o.body)) : null });
    if (o.method === 'POST' && url.endsWith('/v1/payment_intents')) return { ok: true, json: async () => ({ id: 'pi_w1', client_secret: 'pi_w1_secret_x' }) };
    return { ok: true, json: async () => ({ id: 'pi_w1', status, amount: 14750, amount_received: 14750, latest_charge: { balance_transaction: { fee: 241 } } }) };
  };
  assert.equal((await R.startWallet(j, v, 100, { fetchImpl })).error, 'amount', 'under the deposit');
  const ok = await R.startWallet(j, v, 14750, { fetchImpl });
  assert.deepEqual(ok, { clientSecret: 'pi_w1_secret_x', orderId: 'pi_w1' });
  assert.equal(calls[0].body['payment_method_types[0]'], undefined, 'newer Stripe accounts refuse it');
  assert.deepEqual([calls[0].body['automatic_payment_methods[enabled]'], calls[0].body['automatic_payment_methods[allow_redirects]']], ['true', 'never']);
  assert.equal(calls[0].body.amount, '14750');
  assert.deepEqual(await R.settleOrder('pi_w1', { fetchImpl }), { state: 'pending' }, 'not paid yet: nothing recorded');
  status = 'succeeded';
  assert.equal((await R.onWebhook({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_w1' } } }, {}, { fetchImpl })).status, 200);
  await R.onWebhook({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_w1' } } }, {}, { fetchImpl });
  const pays = (await pool.query('select amount_pence, external_ref, fee_pence from job_payments where job_id = $1', [id])).rows;
  assert.deepEqual(pays.map((p) => [Number(p.amount_pence), p.external_ref, Number(p.fee_pence)]), [[14750, 'stripe:pi_w1', 241]]);
  assert.equal((await pool.query("select provider_ref from pay_orders where order_id = 'pi_w1'")).rows[0].provider_ref, 'pi_w1', 'a refund goes back against it');
  assert.ok(buildView(j).walletKey === null, 'no publishable key: no button');
});

test('connecting again registers the sites for Apple Pay and updates the one notice address', async () => {
  const calls = [];
  const fetchImpl = async (url, o = {}) => {
    calls.push({ url, method: o.method || 'GET', body: o.body ? Object.fromEntries(new URLSearchParams(o.body)) : null });
    if (url.endsWith('/v1/payment_method_domains')) return calls.filter((c) => c.url.endsWith('/v1/payment_method_domains')).length === 1 ? { ok: true, json: async () => ({ id: 'pmd_1' }) } : { ok: false, status: 400, json: async () => ({ error: { message: 'This domain already exists.' } }) };
    if (url.includes('/v1/webhook_endpoints?limit')) return { ok: true, json: async () => ({ data: [{ id: 'we_old', url: 'https://dampscan.co.uk/api/quote?doc=stripe' }] }) };
    return { ok: true, json: async () => ({ id: 'we_old' }) };
  };
  await pool.query("insert into integration_keys (name, value) values ('stripe_webhook_secret', 'whsec_keep')");
  await R.connectWebhook('https://dampscan.co.uk/api/quote?doc=stripe', { fetchImpl, domains: ['dampscan.co.uk', 'atidampsurvey.co.uk'] });
  assert.equal(calls.filter((c) => c.url.endsWith('/v1/payment_method_domains')).length, 2, 'both sites, one already there is fine');
  const upd = calls.find((c) => c.url.endsWith('/v1/webhook_endpoints/we_old'));
  assert.ok(upd && upd.body['enabled_events[4]'] === 'payment_intent.succeeded', 'the existing address now hears the button too');
  assert.equal((await pool.query("select value from integration_keys where name = 'stripe_webhook_secret'")).rows[0].value, 'whsec_keep', 'the secret is kept');
  assert.ok((await pool.query("select 1 from integration_keys where name = 'stripe_wallet_domains'")).rows.length);
});
