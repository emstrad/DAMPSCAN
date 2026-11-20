/**
 * The parts of Company, Money that explain where each pound went (the owner,
 * 20 Nov 2026: "we need to see clear stripe fees overview and tax overview and
 * who gets what"). Card payments: what Stripe took, its fees, refunds, what it
 * has paid out to Tide and what it still holds. Who gets what: each person's
 * surveyor fees and share for the period, against what they have been paid and
 * are owed now. The flow: money in, card fees, the tax pot, surveyor fees and
 * the shares, adding up to the penny. All for the company's own money only.
 */
import { query } from './db.js';
import { WHO, NAMES, CUTOVER } from './pay-book.js';

const STRIPE = 'https://api.stripe.com/v1';
const DAMP = ['dampscan', 'ati-london'];

/* Stripe's own figures: the balance it holds and what it has paid out to the bank since a day. Never fails the page. */
async function stripeFigures(from, fetchImpl) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const get = async (path) => {
    const r = await fetchImpl(STRIPE + path, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  };
  try {
    const since = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000);
    const [bal, outs] = await Promise.all([get('/balance'), get(`/payouts?limit=100&created[gte]=${since}`)]);
    const gbp = (list) => (list || []).filter((x) => x.currency === 'gbp').reduce((t, x) => t + Number(x.amount || 0), 0);
    const paid = (outs.data || []).filter((p) => p.status === 'paid' || p.status === 'in_transit');
    return { available: gbp(bal.available), pending: gbp(bal.pending), paidOut: paid.reduce((t, p) => t + Number(p.amount || 0), 0), payouts: paid.length };
  } catch { return { error: true }; }
}

/** Card payments in a period (London days, inclusive): taken, refunded, fees, and the fee as a share of what was taken. */
export async function cardFees(from, to, { fetchImpl = fetch } = {}) {
  const rows = await query(`select p.amount_pence, p.fee_pence, p.label from job_payments p join jobs j on j.id = p.job_id
     where j.site = any($1::text[]) and p.external_ref like 'stripe%'
       and (p.created_at at time zone 'Europe/London')::date >= $2::date and ($3::date is null or (p.created_at at time zone 'Europe/London')::date <= $3::date)`, [DAMP, from, to]).catch(() => []);
  const pays = rows.filter((r) => r.label !== 'refund');
  const taken = pays.reduce((t, r) => t + Number(r.amount_pence), 0);
  const fees = pays.reduce((t, r) => t + (Number(r.fee_pence) || 0), 0);
  const refunded = -rows.filter((r) => r.label === 'refund').reduce((t, r) => t + Number(r.amount_pence), 0);
  return {
    payments: pays.length, taken, fees, refunded, net: taken - fees - refunded,
    rate: taken ? Math.round(10000 * fees / taken) / 100 : 0,
    /* Stripe tells us the fee a moment after the payment; the hourly card check fills in any it missed. */
    feeMissing: pays.filter((r) => r.fee_pence == null).length,
    stripe: await stripeFigures(from, fetchImpl)
  };
}

/**
 * Who gets what for the surveys paid in a period, and where each person stands now.
 * done: the period's paid surveys; book: every new-book survey; out: every new-book payment out.
 */
export function whoGetsWhat(done, book, out) {
  const sum = (list, f) => list.reduce((t, s) => t + f(s), 0);
  const people = WHO.map((k) => {
    const fees = k === 'tax' ? 0 : sum(done.filter((s) => s.surveyor === k), (s) => s.surveyorFee);
    const earned = sum(done, (s) => s.share[k] || 0);
    const allEarned = sum(book.filter((s) => s.paid), (s) => s.share[k] || 0);
    const paid = sum(out.filter((p) => p.who === k), (p) => p.pence);
    const coming = sum(book.filter((s) => !s.paid), (s) => s.share[k] || 0);
    return { key: k, name: NAMES[k], surveys: k === 'tax' ? 0 : done.filter((s) => s.surveyor === k).length, fees, share: earned - fees, earned, paid, owed: allEarned - paid, coming };
  });
  const flow = {
    in: sum(done, (s) => s.price), cardFees: sum(done, (s) => s.fees), tax: sum(done, (s) => s.share.tax),
    surveyorFees: sum(people, (p) => p.fees), shared: sum(people.filter((p) => p.key !== 'tax'), (p) => p.share)
  };
  /* Proof it adds up: what came in, less card fees, is exactly tax, fees and shares. */
  flow.check = flow.in - flow.cardFees - flow.tax - flow.surveyorFees - flow.shared;
  return { people, flow };
}

/** Payments out of the new book, as { who, pence, how }. */
export async function newBookOut() {
  return (await query("select person_key, amount_pence, how, paid_on::text as day from paid_out where removed_at is null and (book = 'new' or (book is null and paid_on >= $1::date))", [CUTOVER]).catch(() => []))
    .map((r) => ({ who: r.person_key, pence: Number(r.amount_pence), how: r.how, day: r.day }));
}
