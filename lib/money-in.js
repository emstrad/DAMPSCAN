/**
 * Money in, as it arrives (the owner, 20 Nov 2026: "payments come in and tick
 * the boxes on the client, but there's no way to see the flow"). Every payment
 * on an ATi or DampScan survey over the last 30 days, newest first: card
 * payments, Tide lines reconciled, bank feed matches, payments typed by hand,
 * refunds as money out, and a deposit or paid in full ticked with no money
 * recorded behind it, for what the tick stood for. A tick a card payment or
 * transfer already covers is not shown again, so each pound shows once.
 *
 * Read by What's next (view=next) for managers; each row opens the customer card.
 */
import { query } from './db.js';

const DAMP = ['dampscan', 'ati-london'];
const DAY = 86400000;

function how(p) {
  const ref = String(p.external_ref || '');
  if (ref.startsWith('stripe')) return 'Card';
  if (ref.startsWith('tide:')) return 'Tide transfer';
  if (p.bank_txn_id) return 'Bank transfer';
  return 'Added by hand';
}

/** Pure: the tick lines for one survey, given the money recorded on it. Exported for the tests. */
export function tickLines(j, recorded, since) {
  const out = [];
  const inWindow = (at) => at && new Date(at).getTime() >= since;
  const dep = j.deposit_paid_at ? Number(j.tick_deposit_pence) || 0 : 0;
  if (inWindow(j.deposit_paid_at) && recorded < dep) out.push({ at: j.deposit_paid_at, kind: 'Deposit', pence: dep - recorded });
  const full = j.paid_at ? Number(j.tick_paid_pence) || 0 : 0;
  const balance = full - Math.max(recorded, dep);
  if (inWindow(j.paid_at) && balance > 0) out.push({ at: j.paid_at, kind: j.deposit_paid_at ? 'Balance' : 'Paid in full', pence: balance });
  return out;
}

export async function moneyIn(sites = DAMP, { days = 30, now = Date.now() } = {}) {
  const s = sites.filter((x) => DAMP.includes(x));
  if (!s.length) return null;
  const since = now - days * DAY;
  const [pays, bank, ticks] = await Promise.all([
    query(`select p.amount_pence, p.label, p.external_ref, p.bank_txn_id, p.created_at as at, j.id, j.site, j.customer_name, j.customer_postcode
        from job_payments p join jobs j on j.id = p.job_id where j.site = any($1::text[]) and p.created_at >= $2`, [s, new Date(since)]),
    query(`select b.amount_pence, b.posted_on as at, j.id, j.site, j.customer_name, j.customer_postcode
        from bank_transactions b join jobs j on j.id = b.job_id where j.site = any($1::text[]) and b.amount_pence > 0 and b.posted_on >= $2::date`, [s, new Date(since)]).catch(() => []),
    query(`select j.id, j.site, j.customer_name, j.customer_postcode, j.deposit_paid_at, j.paid_at, j.tick_deposit_pence, j.tick_paid_pence,
          coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
        + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as recorded
        from jobs j where j.site = any($1::text[]) and (j.deposit_paid_at >= $2 or j.paid_at >= $2)`, [s, new Date(since)])
  ]);
  const who = (r) => ({ jobId: Number(r.id), site: r.site, name: r.customer_name || 'Customer', postcode: r.customer_postcode || null });
  const rows = [
    ...pays.map((p) => ({ ...who(p), at: p.at, pence: Number(p.amount_pence), how: how(p),
      kind: p.label === 'refund' ? 'Refund' : p.label === 'deposit' ? 'Deposit' : p.label === 'balance' ? 'Balance' : 'Payment' })),
    ...bank.map((b) => ({ ...who(b), at: b.at, pence: Number(b.amount_pence), how: 'Bank transfer', kind: 'Payment' })),
    ...ticks.flatMap((j) => tickLines(j, Number(j.recorded) || 0, since).map((t) => ({ ...who(j), at: t.at, pence: t.pence, how: 'Ticked by hand', kind: t.kind })))
  ].filter((r) => r.pence).sort((a, b) => new Date(b.at) - new Date(a.at));
  const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const today = london(now), weekAgo = london(now - 6 * DAY);
  const sum = (list) => list.reduce((t, r) => t + r.pence, 0);
  return {
    rows: rows.map((r) => ({ ...r, day: london(r.at) })),
    today: sum(rows.filter((r) => london(r.at) === today)),
    week: sum(rows.filter((r) => london(r.at) >= weekAgo)),
    days
  };
}
