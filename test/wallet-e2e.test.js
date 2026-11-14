/**
 * The Apple Pay or Google Pay button on the customer's page, end to end
 * through the real page route (api/quote.js) with a pretend Stripe: the
 * page offers it, the amount is checked, Stripe is asked for exactly that,
 * coming back shows it received, Stripe's notice repeating changes nothing,
 * a refund goes back against it, and every refusal is said and kept.
 */
process.env.SMS_QUIET_HOURS = 'off';
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'wallet-secret-long-enough-xxxxxxxxxxxx', IP_SALT: 'wallet-salt-long-enough' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

/* A pretend Stripe: what we asked for, and the payment's state when asked. */
const stripe = { calls: [], status: 'requires_payment_method', n: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.stripe.com/')) return { ok: true, json: async () => ({ sid: 'SM1' }) };
  const body = o.body ? Object.fromEntries(new URLSearchParams(o.body)) : null;
  stripe.calls.push({ url: u, method: o.method || 'GET', body });
  if (o.method === 'POST' && u.endsWith('/v1/payment_intents')) { stripe.n += 1; return { ok: true, json: async () => ({ id: `pi_${stripe.n}`, client_secret: `pi_${stripe.n}_secret` }) }; }
  if (o.method === 'POST' && u.endsWith('/v1/refunds')) return { ok: true, json: async () => ({ id: 're_1' }) };
  const id = u.split('/v1/payment_intents/')[1].split('?')[0];
  return { ok: true, json: async () => ({ id, status: stripe.status, amount: 50, amount_received: 50, latest_charge: { balance_transaction: { fee: 21 } } }) };
};

const { issuePortal } = await import('../lib/portal.js');
const { refundOnline } = await import('../lib/revolut-pay.js');
const handler = (await import('../api/quote.js')).default;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, pay_orders, portal_events, integration_keys restart identity cascade');
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x' });
  Object.assign(stripe, { calls: [], status: 'requires_payment_method', n: 0 });
});
after(async () => { await pool.end(); globalThis.fetch = realFetch; delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_PUBLISHABLE_KEY; });

const DAY = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
async function survey(price = 100) {
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor,
      tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('ati-london', 'booked', 'Scott Test', 'SE18 3QN', '07700 900123', 'localised', $1, true, $2, '14:00', 'scott', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [price, DAY])).rows[0].id);
  const url = await issuePortal(id);
  return { id, t: new URL(url).searchParams.get('t') };
}
const res = () => ({ headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } });
const get = async (q) => { const r = res(); await handler({ method: 'GET', url: '/api/quote?doc=portal&' + q, headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'iPhone' }, socket: {} }, r); return { status: r.statusCode, body: JSON.parse(r.body) }; };
const post = async (body, url = '/api/quote') => { const r = res(); await handler({ method: 'POST', url, headers: { 'x-forwarded-for': '1.2.3.4', 'content-type': 'application/json', 'user-agent': 'iPhone' }, socket: {}, body }, r); return { status: r.statusCode, body: JSON.parse(r.body || '{}') }; };
const trail = async (id) => (await pool.query("select kind, detail from portal_events where job_id = $1 and kind = 'pay_failed' order by at", [id])).rows;

test('Apple Pay on the page: offered, started for exactly the deposit, shown received on the way back, recorded once', async () => {
  const { id, t } = await survey();
  const page = await get('t=' + t);
  assert.equal(page.body.portal.walletKey, 'pk_test_x', 'the page gets the public key');
  assert.equal(page.body.portal.money.minNowPence, 50);

  const start = await post({ doc: 'portal', op: 'wallet', t, pence: 50 });
  assert.equal(start.status, 200);
  assert.equal(start.body.clientSecret, 'pi_1_secret');
  assert.match(start.body.back, /^https:\/\/atidampsurvey\.co\.uk\/my\.html\?t=.+&paid=1$/, 'back to their own brand');
  const made = stripe.calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/payment_intents'));
  assert.deepEqual([made.body.amount, made.body.currency, made.body['payment_method_types[0]'], made.body['automatic_payment_methods[enabled]'], made.body['automatic_payment_methods[allow_redirects]']],
    ['50', 'gbp', undefined, 'true', 'never'], 'the Dashboard decides the methods (newer accounts refuse a list), and nothing redirects away');
  assert.match(made.body.description, /SCOTT\d{4}/, 'the reference on Stripe');

  /* Apple Pay done: the page comes back with paid=1 and asks Stripe itself. */
  stripe.status = 'succeeded';
  const back = await get(`t=${t}&paid=1`);
  assert.equal(back.body.portal.payment.state, 'completed');
  assert.equal(back.body.portal.money.paidPence, 50, 'the page shows it received straight away');
  assert.equal(back.body.portal.state, 'booked', 'deposit paid: no longer asking for it');
  const j = (await pool.query('select deposit_paid_at, paid_at from jobs where id = $1', [id])).rows[0];
  assert.ok(j.deposit_paid_at); assert.equal(j.paid_at, null, '50p of £1 is not paid in full');

  /* Stripe's notice arriving after, and again: still one payment. */
  for (let i = 0; i < 2; i += 1) assert.equal((await post({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } }, '/api/quote?doc=stripe')).status, 200);
  const pays = (await pool.query('select amount_pence, label, external_ref, fee_pence from job_payments where job_id = $1', [id])).rows;
  assert.deepEqual(pays.map((p) => [Number(p.amount_pence), p.label, p.external_ref, Number(p.fee_pence)]), [[50, 'deposit', 'stripe:pi_1', 21]]);

  /* A refund goes back against that Apple Pay payment. */
  assert.deepEqual(await refundOnline(id, 50, { by: 'Scott' }), { refunded: 50 });
  assert.equal(stripe.calls.find((c) => c.url.endsWith('/v1/refunds')).body.payment_intent, 'pi_1');
});

test('every refusal is said to the phone and kept on their card', async () => {
  const { id, t } = await survey();
  const low = await post({ doc: 'portal', op: 'wallet', t, pence: 10 });
  assert.equal(low.status, 400); assert.equal(low.body.error, 'amount');
  const high = await post({ doc: 'portal', op: 'wallet', t, pence: 500 });
  assert.equal(high.body.error, 'amount', 'never more than is owed');
  assert.equal(stripe.calls.length, 0, 'Stripe is never asked for a wrong amount');
  /* The phone's own failure (a declined card, Apple Pay closed): kept with its reason. */
  assert.equal((await post({ doc: 'portal', op: 'wallet_failed', t, text: 'Your card was declined.' })).status, 200);
  const kept = await trail(id);
  assert.equal(kept.length, 3);
  assert.match(kept[2].detail, /declined/);
  assert.equal((await post({ doc: 'portal', op: 'wallet_failed', t: 'x'.repeat(32), text: 'x' })).status, 404, 'only a real page');
});

test('nothing to pay, nothing offered: a cancelled survey and one paid in full refuse it; no key, no button', async () => {
  const { id, t } = await survey();
  await pool.query("update jobs set status = 'cancelled' where id = $1", [id]);
  assert.equal((await post({ doc: 'portal', op: 'wallet', t, pence: 50 })).body.error, 'not_now');
  const b = await survey();
  await pool.query('update jobs set paid_at = now(), deposit_paid_at = now() where id = $1', [b.id]);
  assert.equal((await post({ doc: 'portal', op: 'wallet', t: b.t, pence: 50 })).body.error, 'not_now');
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  const c = await survey();
  assert.equal((await get('t=' + c.t)).body.portal.walletKey, null);
  process.env.PAY_ONLINE = 'off';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_x';
  assert.equal((await get('t=' + c.t)).body.portal.walletKey, null, 'payments switched off: no button either');
  delete process.env.PAY_ONLINE;
});

test('a payment that never finished stays unpaid, and the hourly sweep records one Stripe finishes later', async () => {
  const { id, t } = await survey();
  await post({ doc: 'portal', op: 'wallet', t, pence: 50 });
  const back = await get(`t=${t}&paid=1`);
  assert.notEqual(back.body.portal.payment.state, 'completed', 'not paid yet: never shown as received');
  assert.equal(back.body.portal.money.paidPence, 0);
  const { sweepOrders } = await import('../lib/revolut-pay.js');
  stripe.status = 'succeeded';
  assert.equal((await sweepOrders()).recorded, 1);
  assert.equal(Number((await pool.query('select count(*) from job_payments where job_id = $1', [id])).rows[0].count), 1);
});
