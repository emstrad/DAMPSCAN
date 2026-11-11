/**
 * Paying online from the customer's page (the owners' plan, 11 Nov 2026):
 * Apple Pay, Google Pay, card and Revolut Pay through Revolut's own secure
 * page. Our server makes a Revolut order for the exact amount the customer
 * chose (checked here, never trusted from the page), sends them to Revolut,
 * and records the payment only when Revolut confirms it: its webhook says
 * which order to look at, and Revolut itself is asked (also when the customer
 * comes back first).
 * A payment is recorded once (job_payments.external_ref), ticks the deposit
 * or paid in full, texts the customer and alerts the team.
 *
 * Off until REVOLUT_MERCHANT_KEY (the Production secret key from Revolut
 * Business: Merchant, APIs) is set in Vercel. The webhook is registered from
 * Settings ("Connect Revolut payments").
 */
import { query, queryOne } from './db.js';
import { notify } from './notify.js';
import { customer, jobPage } from './alert-words.js';
import { moneyOf, referenceFor } from './portal-view.js';
import { textsAfterChange, flushDue } from './texts.js';

const API = () => (process.env.REVOLUT_SANDBOX === 'on' ? 'https://sandbox-merchant.revolut.com' : 'https://merchant.revolut.com');
const VERSION = '2025-12-04';
const TIMEOUT_MS = 10000;
const pounds = (p) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;

export const payOnline = () => Boolean((process.env.REVOLUT_MERCHANT_KEY || '').trim()) && process.env.PAY_ONLINE !== 'off';

async function revolut(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const r = await fetchImpl(API() + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.REVOLUT_MERCHANT_KEY}`, 'Revolut-Api-Version': VERSION, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Revolut said ${r.status}`);
  return data;
}

/**
 * Starts a payment of `pence` for the survey behind a customer's page. The
 * amount must be at least what is due now (the deposit, or the whole balance
 * once the report is ready) and no more than the balance.
 */
export async function startPayment(j, view, pence, { returnUrl, fetchImpl } = {}) {
  if (!payOnline()) return { error: 'off' };
  /* Only while something is owed on a live survey: never a cancelled one, never before it has a date. */
  if (!['deposit', 'booked', 'ready'].includes(view.state)) return { error: 'not_now' };
  const m = view.money;
  const least = view.state === 'ready' ? m.balancePence : m.minNowPence;
  const amount = Math.round(Number(pence));
  if (!Number.isFinite(amount) || amount <= 0 || amount < least || amount > m.balancePence) return { error: 'amount' };
  const reference = referenceFor(j.customer_name, j.id);
  const order = await revolut('/api/orders', { method: 'POST', fetchImpl, body: {
    amount, currency: 'GBP', description: `${view.survey}, ${reference}`,
    merchant_order_data: { reference }, metadata: { job_id: String(j.id) },
    redirect_url: returnUrl, statement_descriptor_suffix: reference.slice(0, 10)
  } });
  await query(`insert into pay_orders (order_id, job_id, amount_pence, state) values ($1, $2, $3, 'pending') on conflict (order_id) do nothing`, [order.id, j.id, amount]);
  return { url: order.checkout_url, orderId: order.id };
}

/**
 * Records a completed Revolut order against its survey, once. Called from
 * the webhook and when the customer comes back to their page. The amount is
 * Revolut's, read from Revolut, never the page's.
 */
export async function settleOrder(orderId, { fetchImpl } = {}) {
  const row = await queryOne('select * from pay_orders where order_id = $1', [orderId]);
  if (!row) return { unknown: true };
  if (row.state === 'completed') return { already: true };
  const order = await revolut(`/api/orders/${encodeURIComponent(orderId)}`, { fetchImpl });
  const state = String(order.state || '').toLowerCase();
  if (state !== 'completed') {
    if (['failed', 'cancelled', 'declined'].includes(state)) await query('update pay_orders set state = $2, updated_at = now() where order_id = $1', [orderId, state]);
    return { state };
  }
  const amount = Number(order.amount) || Number(row.amount_pence);
  /* The payment first (its external_ref makes it once, however many callers race), then the order marked done. */
  const got = await recordPayment(Number(row.job_id), amount, `Paid online (Revolut ${orderId.slice(0, 8)})`, `revolut:${orderId}`, feeOf(order));
  await query(`update pay_orders set state = 'completed', updated_at = now() where order_id = $1`, [orderId]);
  return got ? { recorded: amount } : { already: true };
}

/* Revolut's fee on the order, when its answer carries one (pence), else null. */
export function feeOf(order) {
  const fees = (order && Array.isArray(order.payments) ? order.payments : []).flatMap((p) => (Array.isArray(p.fees) ? p.fees : []));
  const total = fees.reduce((t, f) => t + (Number(f.amount) || 0), 0);
  return fees.length ? Math.round(total) : null;
}

/** One payment in, by any route: the ledger, the ticks, the text and the alert. */
export async function recordPayment(jobId, pence, note, externalRef, feePence = null) {
  const j = await queryOne(`select j.*, coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
       + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as paid_pence from jobs j where j.id = $1`, [jobId]);
  if (!j) return null;
  const before = moneyOf(j);
  const label = before.paidPence === 0 && pence < before.pricePence ? 'deposit' : before.paidPence + pence >= before.pricePence ? 'balance' : 'payment';
  const ins = await queryOne(`insert into job_payments (job_id, amount_pence, label, note, external_ref, fee_pence) values ($1, $2, $3, $4, $5, $6)
      on conflict (external_ref) where external_ref is not null do nothing returning id`, [jobId, pence, label, note, externalRef, feePence]);
  if (!ins) return null;
  const paid = Math.max(before.paidPence, 0) + pence;
  await query(`update jobs set deposit_paid_at = case when $2 >= $3 then coalesce(deposit_paid_at, now()) else deposit_paid_at end,
      paid_at = case when $2 >= $4 then coalesce(paid_at, now()) else paid_at end where id = $1`, [jobId, paid, before.depositPence, before.pricePence]);
  /* The customer caused it, so their text goes at once, not after the staff wait. */
  await textsAfterChange(jobId, { delayMs: 0, by: 'Revolut' });
  await flushDue({ limit: 3 }).catch(() => {});
  await notify({ business: j.site, kind: 'payment', ref: jobId, tags: 'moneybag', priority: 3, path: jobPage(j.site, jobId),
    title: 'Paid online', message: `${customer(j.customer_name, j.customer_postcode)} paid ${pounds(pence)}${paid >= before.pricePence ? ', now paid in full' : ''}.` });
  return { paid };
}

/**
 * The webhook. Vercel hands the body over already parsed, so its signature
 * cannot always be checked against the exact bytes; it is checked when it
 * can, but never relied on. Each event is only "look at order X": the truth
 * comes from asking Revolut with our own key, so a forged one changes nothing.
 */
export async function onWebhook(body, headers = {}, { fetchImpl } = {}) {
  let event = body;
  if (typeof body === 'string') { try { event = JSON.parse(body); } catch { return { status: 400 }; } }
  if (!event || !event.order_id) return { status: 200 };
  const known = await queryOne('select 1 from pay_orders where order_id = $1', [String(event.order_id)]);
  if (!known) return { status: 200 };
  /* If Revolut cannot be asked just now, say so: Revolut sends the notice again later. */
  try { await settleOrder(String(event.order_id), { fetchImpl }); } catch (err) { console.warn('revolut settle failed:', err.message); return { status: 500 }; }
  return { status: 200 };
}

/** Registers our webhook with Revolut and keeps its signing secret (Settings, owners). */
export async function connectWebhook(url, { fetchImpl } = {}) {
  const hook = await revolut('/api/webhooks', { method: 'POST', fetchImpl, body: { url, events: ['ORDER_COMPLETED', 'ORDER_FAILED', 'ORDER_CANCELLED'] } });
  await query(`insert into integration_keys (name, value) values ('revolut_webhook_secret', $1) on conflict (name) do update set value = excluded.value, updated_at = now()`, [hook.signing_secret]);
  return { ok: true, id: hook.id };
}

/**
 * Refunds `pence` to the card(s) a customer paid with online, newest payment
 * first, through Revolut (owners and managers, after a confirm on the job
 * card). Recorded as a refund line once per Revolut refund. Never sends a text.
 */
export async function refundOnline(jobId, pence, { by = 'Staff', fetchImpl } = {}) {
  if (!payOnline()) return { error: 'off' };
  let left = Math.round(Number(pence));
  if (!Number.isFinite(left) || left <= 0) return { error: 'amount' };
  const orders = await query(`select order_id, amount_pence - refunded_pence as room from pay_orders
      where job_id = $1 and state = 'completed' and amount_pence > refunded_pence order by created_at desc`, [jobId]);
  if (orders.reduce((t, o) => t + Number(o.room), 0) < left) return { error: 'more_than_paid_online' };
  let done = 0;
  for (const o of orders) {
    if (left <= 0) break;
    const part = Math.min(left, Number(o.room));
    /* Claimed before Revolut is asked, so two taps at once can never refund the same money twice. */
    const claimed = await queryOne(`update pay_orders set refunded_pence = refunded_pence + $2, updated_at = now()
        where order_id = $1 and amount_pence - refunded_pence >= $2 returning order_id`, [o.order_id, part]);
    if (!claimed) continue;
    let r;
    try { r = await revolut(`/api/orders/${encodeURIComponent(o.order_id)}/refund`, { method: 'POST', fetchImpl, body: { amount: part, currency: 'GBP', description: 'Survey refund' } }); }
    catch (err) {
      /* No answer (a timeout): Revolut may have made it, so the claim stays and a person checks; a clear refusal gives it back. */
      if (/timeout|aborted|fetch failed|network/i.test(String(err.message || err.name))) {
        await query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) select site, id, $2, 'Revolut', 'manual', true from jobs where id = $1`,
          [jobId, `Check Revolut: a card refund of £${(part / 100).toFixed(2)} got no answer. If it went through, add it on the job; if not, try again.`]);
        throw new Error('Revolut did not answer. A to-do has been made to check it before trying again.');
      }
      await query('update pay_orders set refunded_pence = refunded_pence - $2, updated_at = now() where order_id = $1', [o.order_id, part]);
      if (done) break;
      throw err;
    }
    await query(`insert into job_payments (job_id, amount_pence, label, note, external_ref) values ($1, $2, 'refund', $3, $4)
        on conflict (external_ref) where external_ref is not null do nothing`, [jobId, -part, `Refunded to card by ${by}`, `revolut-refund:${r.id || o.order_id + ':' + Date.now()}`]);
    left -= part; done += part;
  }
  return { refunded: done };
}

/** What can still be refunded to a card for this survey. */
export async function refundableOnline(jobId) {
  const r = await queryOne(`select coalesce(sum(amount_pence - refunded_pence), 0)::bigint as p from pay_orders where job_id = $1 and state = 'completed'`, [jobId]);
  return Number(r.p) || 0;
}

/**
 * Hourly: any card payment still open from the last two days is asked about
 * again, so a notice that never arrived (or failed) never loses a payment.
 */
export async function sweepOrders({ fetchImpl } = {}) {
  if (!payOnline()) return { checked: 0 };
  const open = await query(`select order_id from pay_orders where state = 'pending' and created_at > now() - interval '2 days' order by created_at limit 50`);
  let recorded = 0;
  for (const o of open) {
    const out = await settleOrder(o.order_id, { fetchImpl }).catch(() => ({}));
    if (out.recorded) recorded += 1;
  }
  return { checked: open.length, recorded };
}

/** The latest online payment for a page that has just come back from Revolut. */
export async function latestOrder(jobId, { fetchImpl } = {}) {
  const row = await queryOne(`select order_id, state, amount_pence from pay_orders where job_id = $1 and created_at > now() - interval '2 hours' order by created_at desc limit 1`, [jobId]);
  if (!row) return null;
  if (row.state === 'pending' && payOnline()) {
    const out = await settleOrder(row.order_id, { fetchImpl }).catch(() => ({}));
    if (out.recorded || out.already) return { state: 'completed', pence: Number(row.amount_pence) };
    /* Still going through at the bank (processing, authorised): the page keeps confirming, never "nothing was taken". */
    if (out.state) return { state: ['processing', 'authorised', 'pending'].includes(out.state) ? 'pending' : out.state, pence: Number(row.amount_pence) };
  }
  return { state: row.state, pence: Number(row.amount_pence) };
}
