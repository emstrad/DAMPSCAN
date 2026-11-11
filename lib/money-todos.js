/**
 * The hourly money checks for ATi and DampScan (the owners' plan, 11 Nov 2026).
 * Each makes one to-do for the owners and never moves money by itself:
 *
 *   refund due   a cancelled survey that owes money back (everything when
 *                cancelled 48 hours or more before, else all but the deposit)
 *   overpaid     more paid than the price
 *   deposit      booked 48 hours ago and still no deposit: chase them. The
 *                booking is never let go by itself.
 *
 * Each is marked on the job once (refund_todo_at, credit_todo_at,
 * deposit_chased_at), so a run that comes again says nothing twice.
 */
import { query } from './db.js';
import { moneyOf, refundOwed } from './portal-view.js';

const pounds = (p) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;
const who = (j) => `${String(j.customer_name || 'the customer').trim().split(/\s+/)[0]}${j.customer_postcode ? ' (' + String(j.customer_postcode).split(' ')[0] + ')' : ''}`;

/* Paid and refunded as the customer's page counts them. */
const MONEY = `j.*, j.job_date::text as job_day,
  coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
    + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as paid_pence,
  coalesce((select -sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label = 'refund'), 0) as refunded_pence,
  exists (select 1 from pay_orders o where o.job_id = j.id and o.state = 'completed') as paid_online`;

async function todo(j, text) {
  await query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ($1, $2, $3, 'Money check', 'manual', true)`, [j.site, j.id, text]);
}

export async function refundsDue() {
  const rows = await query(`select ${MONEY} from jobs j where j.site in ('dampscan', 'ati-london') and j.status = 'cancelled'
      and j.refund_todo_at is null and j.cancelled_at > now() - interval '30 days'`);
  let n = 0;
  for (const j of rows) {
    await query('update jobs set refund_todo_at = now() where id = $1', [j.id]);
    const m = moneyOf(j);
    const owed = refundOwed(j, m);
    if (!owed) continue;
    const late = owed < m.paidPence - m.refundedPence;
    await todo(j, `Refund ${who(j)} ${pounds(owed)}: cancelled ${late ? 'within 48 hours, so the deposit is kept and the rest goes back' : '48 hours or more before the survey, so it all goes back'}.${j.paid_online ? ' Paid by card: use Refund in their job card.' : ''}`);
    n += 1;
  }
  return n;
}

export async function overpaid() {
  const rows = await query(`select ${MONEY} from jobs j where j.site in ('dampscan', 'ati-london') and j.status not in ('cancelled', 'declined', 'refunded')
      and j.credit_todo_at is null and j.survey_price_pence > 0`);
  let n = 0;
  for (const j of rows) {
    const m = moneyOf(j);
    const over = m.paidPence - m.refundedPence - m.pricePence;
    if (over <= 0) continue;
    await query('update jobs set credit_todo_at = now() where id = $1', [j.id]);
    await todo(j, `${who(j)} has paid ${pounds(over)} more than the price. Refund it${j.paid_online ? ' (Refund in their job card)' : ''} or note why.`);
    n += 1;
  }
  return n;
}

export async function depositChase() {
  const rows = await query(`select ${MONEY} from jobs j where j.site in ('dampscan', 'ati-london') and j.status = 'booked' and j.date_set
      and j.job_date >= (now() at time zone 'Europe/London')::date and not j.awaiting_agent and j.deposit_chased_at is null
      and j.deposit_paid_at is null and j.paid_at is null and j.survey_price_pence > 0
      and coalesce(j.booked_at, j.created_at) <= now() - interval '48 hours'`);
  let n = 0;
  for (const j of rows) {
    const m = moneyOf(j);
    if (m.depositPaid) continue;
    await query('update jobs set deposit_chased_at = now() where id = $1', [j.id]);
    await todo(j, `Chase ${who(j)} for the ${pounds(m.minNowPence)} deposit: booked 2 days ago and nothing paid yet. The booking stays.`);
    n += 1;
  }
  return n;
}

/** All three, each on its own so one failing never stops the others. */
export async function moneyChecks() {
  const out = {};
  for (const [k, fn] of Object.entries({ refunds: refundsDue, overpaid, deposits: depositChase })) {
    out[k] = await fn().catch((err) => { console.error(`${k} check failed:`, err.message); return null; });
  }
  return out;
}
