/**
 * Stripe's payouts as they land in Tide (the owner, 20 Nov 2026: "it needs to
 * know when the money comes into Tide it's from Stripe, less fees, and we
 * don't need to match them"). A payout is never a customer's transfer and is
 * never matched to a survey: each card payment in it is already on its
 * survey. Here each payout line is put beside Stripe's own payout of that
 * amount (arriving within three days) to say what it held: how many card
 * payments, their total, Stripe's fees and any refunds taken out. Read only.
 */
const API = 'https://api.stripe.com/v1';
const DAY = 86400;

/** A Tide line that is Stripe paying out: the words, the payer or the type say so. */
export const isPayout = (l) => l.pence > 0 && /\bstripe\b/i.test([l.what, l.reference, l.type, l.from].join(' '));

async function get(path, fetchImpl) {
  const r = await fetchImpl(API + path, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** What one payout held, from its balance transactions. Pure over the list, for the tests. */
export function payoutParts(txns) {
  const t = (txns || []).filter((x) => x.type !== 'payout');
  const charges = t.filter((x) => x.type === 'charge' || x.type === 'payment');
  const refunds = t.filter((x) => /refund/.test(x.type));
  return {
    payments: charges.length,
    gross: charges.reduce((s, x) => s + Number(x.amount || 0), 0),
    fees: t.reduce((s, x) => s + Number(x.fee || 0), 0),
    refunds: -refunds.reduce((s, x) => s + Number(x.amount || 0), 0),
    other: t.filter((x) => !charges.includes(x) && !refunds.includes(x)).reduce((s, x) => s + Number(x.net || 0), 0)
  };
}

/**
 * Each payout line, with Stripe's payout beside it when one of that amount arrived within three days.
 * Returns a Map of line ref to { id, arrival, ...payoutParts }. Never fails the check.
 */
export async function payoutsFor(lines, { fetchImpl = fetch } = {}) {
  const out = new Map();
  const ours = lines.filter(isPayout);
  if (!ours.length || !process.env.STRIPE_SECRET_KEY) return out;
  try {
    const days = ours.map((l) => Date.parse(l.day + 'T12:00:00Z') / 1000);
    const from = Math.floor(Math.min(...days) - 4 * DAY), to = Math.ceil(Math.max(...days) + 4 * DAY);
    const list = (await get(`/payouts?limit=100&arrival_date[gte]=${from}&arrival_date[lte]=${to}`, fetchImpl)).data || [];
    const used = new Set();
    for (const l of ours) {
      const at = Date.parse(l.day + 'T12:00:00Z') / 1000;
      const p = list.find((x) => !used.has(x.id) && Number(x.amount) === l.pence && Math.abs(Number(x.arrival_date) - at) <= 3 * DAY);
      if (!p) continue;
      used.add(p.id);
      const txns = (await get(`/balance_transactions?limit=100&payout=${p.id}`, fetchImpl)).data || [];
      out.set(l.ref, { id: p.id, arrival: new Date(Number(p.arrival_date) * 1000).toISOString().slice(0, 10), ...payoutParts(txns) });
    }
  } catch { /* Stripe not answering leaves the lines as plain payouts. */ }
  return out;
}
