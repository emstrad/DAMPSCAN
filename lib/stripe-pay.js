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
/* cs_: Stripe's own page (Checkout). pi_: the Apple Pay or Google Pay button on their page. */
export const isStripe = (id) => /^(cs|pi)_/.test(String(id || ''));
export const walletKey = () => (stripeOn() ? String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim() || null : null);

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
  if (/^pi_/.test(id)) {
    const pi = await stripe(`/payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge.balance_transaction`, { fetchImpl });
    const bt = pi.latest_charge && pi.latest_charge.balance_transaction;
    if (pi.status === 'succeeded') return { state: 'completed', amount: Number(pi.amount_received || pi.amount), fee: bt && typeof bt === 'object' ? Number(bt.fee) : null, ref: pi.id };
    if (pi.status === 'canceled') return { state: 'cancelled' };
    return { state: pi.status === 'processing' ? 'processing' : 'pending' };
  }
  const s = await stripe(`/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.latest_charge.balance_transaction`, { fetchImpl });
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const bt = pi && pi.latest_charge && pi.latest_charge.balance_transaction;
  if (s.status === 'complete' && s.payment_status === 'paid') {
    return { state: 'completed', amount: Number(s.amount_total), fee: bt && typeof bt === 'object' ? Number(bt.fee) : null, ref: pi ? pi.id : s.payment_intent };
  }
  if (s.status === 'expired') return { state: 'cancelled' };
  return { state: s.status === 'complete' ? 'processing' : 'pending' };
}

/**
 * The Apple Pay or Google Pay button on their own page: a payment for exactly
 * `amount` pence that the button confirms there and then, no trip to Stripe's
 * page. The methods follow the Dashboard (Apple Pay and Google Pay are cards underneath).
 */
export async function stripeIntent({ jobId, amount, survey, reference, fetchImpl }) {
  const pi = await stripe('/payment_intents', { method: 'POST', fetchImpl, idem: `wallet-${jobId}-${amount}-${Date.now()}`, body: {
    /* Newer Stripe accounts refuse payment_method_types: the methods come from the Dashboard's settings.
       No redirects, so a wallet payment always finishes on their page. */
    amount, currency: 'gbp', automatic_payment_methods: { enabled: true, allow_redirects: 'never' }, description: `${survey}, ${reference}`,
    metadata: { job_id: String(jobId), reference }
  } });
  return { id: pi.id, clientSecret: pi.client_secret };
}

/** Gives back `pence` of one card payment. The key makes a retried tap the same refund. */
export async function stripeRefund(paymentIntent, pence, key, { fetchImpl } = {}) {
  const r = await stripe('/refunds', { method: 'POST', fetchImpl, idem: key, body: { payment_intent: paymentIntent, amount: pence, reason: 'requested_by_customer' } });
  return { id: r.id };
}

/** Registers our notice address with Stripe; its signing secret comes back once. */
const EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired',
  'payment_intent.succeeded', 'payment_intent.payment_failed'];
export async function stripeConnect(url, { fetchImpl, domains = [] } = {}) {
  /* Apple Pay on their page needs each site registered with Stripe (Stripe deals with Apple). Already there is fine. */
  for (const d of domains) await stripe('/payment_method_domains', { method: 'POST', fetchImpl, body: { domain_name: d } }).catch((err) => { if (!/already/i.test(err.message)) throw err; });
  /* Connecting again brings the one notice address up to date rather than adding a second. */
  const list = await stripe('/webhook_endpoints?limit=100', { fetchImpl }).catch(() => ({ data: [] }));
  /* One saved earlier with a doubled slash (which was redirected, so nothing arrived) is the same address: put right in place. */
  const same = (u) => String(u || '').replace(/([^:])\/{2,}/g, '$1/');
  const have = (list.data || []).find((w) => same(w.url) === same(url));
  if (have) {
    await stripe(`/webhook_endpoints/${encodeURIComponent(have.id)}`, { method: 'POST', fetchImpl, body: { url, enabled_events: EVENTS } });
    return { id: have.id, secret: null };
  }
  const hook = await stripe('/webhook_endpoints', { method: 'POST', fetchImpl, body: { url, description: 'Customer page payments', enabled_events: EVENTS } });
  return { id: hook.id, secret: hook.secret };
}

/** The session a Stripe notice is about, or null for anything else. */
export function stripeSessionOf(event) {
  const o = event && event.data && event.data.object;
  return event && /^(checkout\.session|payment_intent)\./.test(String(event.type || '')) && o && isStripe(o.id) ? String(o.id) : null;
}
