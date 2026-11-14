/**
 * Card, Apple Pay and Google Pay through Stripe Checkout (the owners' choice,
 * 14 Nov 2026, after Revolut refused the company): the customer pays on
 * Stripe's own secure page, so no card details ever touch our server.
 * lib/revolut-pay.js keeps everything around a payment (the amount checks,
 * recording it once, the ticks, the text, refunds and the hourly sweep) and
 * calls here for the Stripe parts when STRIPE_SECRET_KEY is set.
 *
 * As with Revolut, a notice from Stripe only ever means "look at session X":
 * the truth comes from asking Stripe with our own key, so a forged notice
 * changes nothing.
 */
const API = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 10000;

export const stripeOn = () => Boolean((process.env.STRIPE_SECRET_KEY || '').trim());
export const isStripe = (id) => /^cs_/.test(String(id || ''));

/* Stripe takes form fields, nested with brackets (metadata[job_id]=42). */
export function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(path, { method = 'GET', body, idem, fetchImpl = fetch } = {}) {
  const r = await fetchImpl(API + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idem ? { 'Idempotency-Key': idem } : {}) },
    body: body ? form(body).toString() : undefined, signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data.error && data.error.message) || `Stripe said ${r.status}`);
  return data;
}

/** A Checkout Session for exactly `amount` pence; the customer comes back to their page either way. */
export async function stripeStart({ jobId, amount, survey, reference, returnUrl, fetchImpl }) {
  const s = await stripe('/checkout/sessions', { method: 'POST', fetchImpl, idem: `pay-${jobId}-${amount}-${Date.now()}`, body: {
    mode: 'payment', client_reference_id: String(jobId),
    line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: amount, product_data: { name: `${survey}, ${reference}` } } }],
    /* Backing out returns to their page as it was, not to "confirming". */
    success_url: returnUrl, cancel_url: String(returnUrl).replace(/&paid=1$/, ''),
    metadata: { job_id: String(jobId), reference },
    payment_intent_data: { description: `${survey}, ${reference}`, metadata: { job_id: String(jobId), reference } }
  } });
  return { id: s.id, url: s.url };
}

/**
 * Where a session stands, in the words lib/revolut-pay.js uses: completed
 * (with Stripe's amount, its fee when known, and the payment to refund),
 * pending while it is still open or the bank is still deciding, cancelled
 * once it has expired.
 */
export async function stripeOrder(id, { fetchImpl } = {}) {
  const s = await stripe(`/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.latest_charge.balance_transaction`, { fetchImpl });
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const bt = pi && pi.latest_charge && pi.latest_charge.balance_transaction;
  if (s.status === 'complete' && s.payment_status === 'paid') {
    return { state: 'completed', amount: Number(s.amount_total), fee: bt && typeof bt === 'object' ? Number(bt.fee) : null, ref: pi ? pi.id : s.payment_intent };
  }
  if (s.status === 'expired') return { state: 'cancelled' };
  return { state: s.status === 'complete' ? 'processing' : 'pending' };
}

/** Gives back `pence` of one card payment. The key makes a retried tap the same refund. */
export async function stripeRefund(paymentIntent, pence, key, { fetchImpl } = {}) {
  const r = await stripe('/refunds', { method: 'POST', fetchImpl, idem: key, body: { payment_intent: paymentIntent, amount: pence, reason: 'requested_by_customer' } });
  return { id: r.id };
}

/** Registers our notice address with Stripe; its signing secret comes back once. */
export async function stripeConnect(url, { fetchImpl } = {}) {
  const hook = await stripe('/webhook_endpoints', { method: 'POST', fetchImpl, body: {
    url, description: 'Customer page payments',
    enabled_events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired']
  } });
  return { id: hook.id, secret: hook.secret };
}

/** The session a Stripe notice is about, or null for anything else. */
export function stripeSessionOf(event) {
  const o = event && event.data && event.data.object;
  return event && /^checkout\.session\./.test(String(event.type || '')) && o && isStripe(o.id) ? String(o.id) : null;
}
