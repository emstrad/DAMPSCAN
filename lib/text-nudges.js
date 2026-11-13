/**
 * The gentle texts that wait on time passing (the owners' rules, 13 Nov 2026),
 * each once per customer and checked again as it goes (lib/texts.js):
 *
 *   partial           a form left part way with a mobile given: ten minutes
 *                     after they stopped, a "can we help?" (never a sales text)
 *   deposit_reminder  booked two days with no deposit, the survey still over a
 *                     day away (the morning text asks on the day itself)
 *   balance_reminder  the report ready three days with the balance unpaid
 *
 * The reminders are queued by the hourly run in the daytime only (10am to
 * 6pm), so they never land early in the morning or late in the evening.
 */
import { query } from './db.js';
import { queueText } from './texts.js';
import { moneyOf } from './portal-view.js';
import { PARTIAL_WAIT_MIN } from './text-pick.js';

/** A half-finished form gave a phone: its "can we help?" waits ten minutes (and longer while they are still typing). */
export function queuePartial(site, leadId) {
  return queueText({ kind: 'partial', site, leadId, key: 'partial', delayMs: PARTIAL_WAIT_MIN * 60000 });
}

const DAYTIME = { from: 10, until: 18 };
const londonHour = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));

const SUMS = `coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
   + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as paid_pence`;

/** The hourly run's reminders. Returns how many were queued. */
export async function queueReminders({ hour = londonHour() } = {}) {
  if (hour < DAYTIME.from || hour >= DAYTIME.until) return 0;
  let n = 0;
  /* Deposits: booked 48 hours, a booked text that went, nothing paid, more than a day to go. */
  const owed = await query(`select j.*, ${SUMS} from jobs j where j.site in ('dampscan', 'ati-london') and j.status = 'booked' and j.date_set
      and j.booked_at < now() - interval '48 hours' and j.job_date > (now() at time zone 'Europe/London')::date + 1 and not coalesce(j.awaiting_agent, false)
      and exists (select 1 from sms_outbox o where o.job_id = j.id and o.kind = 'booked' and o.status = 'sent')
      and not exists (select 1 from sms_outbox o where o.job_id = j.id and o.kind = 'deposit_reminder')`);
  for (const j of owed) if (!moneyOf(j).depositPaid && await queueText({ kind: 'deposit_reminder', site: j.site, jobId: j.id, key: 'deposit' })) n += 1;
  /* Balances: the "report ready, balance due" text went three days ago and it is still owed. */
  const waiting = await query(`select j.*, ${SUMS} from jobs j where j.site in ('dampscan', 'ati-london') and j.status not in ('cancelled', 'declined', 'refunded')
      and not coalesce(j.report_held, false)
      and exists (select 1 from sms_outbox o where o.job_id = j.id and o.kind = 'ready' and o.status = 'sent' and o.sent_at < now() - interval '3 days')
      and not exists (select 1 from sms_outbox o where o.job_id = j.id and o.kind = 'balance_reminder')`);
  for (const j of waiting) if (!moneyOf(j).paidInFull && await queueText({ kind: 'balance_reminder', site: j.site, jobId: j.id, key: 'balance' })) n += 1;
  return n;
}
