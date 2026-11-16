/**
 * To-dos the system made close themselves once they are done (the owner,
 * 16 Nov 2026: "so many to-do items"). Only the system's own: the money
 * checks, failed texts, Scheduling's holds, the card company and the report
 * check. Anything a person or ChatGPT added still waits for a person (the
 * owners' choice stands for those: the job pop-up asks "These look done now").
 *
 * Done means the fact behind it has changed: the deposit, balance or report it
 * chased is in; the customer it was about is cancelled or closed; an overpaid
 * or refund one no longer owes anything; a failed text has had a later text go
 * through to the same customer; a held time has been booked or let go.
 */
import { query } from './db.js';
import { moneyOf, refundOwed } from './portal-view.js';
import { moveAsked } from './portal-asks.js';

export const SYSTEM = ['Money check', 'Texts', 'Scheduling', 'Revolut', 'Website', 'Their page', 'Report check'];

/* The same chase words the job pop-up uses (lib/journey.js), so both agree on "done". */
const SETTLED = [
  ['deposit_paid_at', /\b(chase|take|collect|get|ask for)\b(?:[^.]|\.\d)*\bdeposit\b|\bdeposit (due|owed|outstanding|not paid)/i],
  ['paid_at', /\b(chase|collect|take|get)\b(?:[^.]|\.\d)*\b(balance|payment|money|paid in full)\b|\bunpaid\b|\bstill (owes|to pay)\b/i],
  ['survey_sent_at', /\b(send|write|finish|email)\b(?:[^.]|\.\d)*\breport\b|\breport (due|overdue|to send)\b|press Report ready/i],
  ['booked', /^(book|offer|find|call back|ring back|phone back|pencil|chase\b[^:]*: no yes)/i]
];

const MONEY = `j.job_date::text as job_day,
  coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
    + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as paid_pence,
  coalesce((select -sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label = 'refund'), 0) as refunded_pence`;

/** Why this open system to-do is done now, or null while it still needs someone. */
export function doneBecause(t, j, lead, laterText) {
  const text = String(t.text || '');
  if (j) {
    const gone = ['cancelled', 'declined'].includes(j.status);
    if (/^Refund /.test(text)) return refundOwed(j, moneyOf(j)) > 0 ? null : 'nothing left to refund';
    if (/more than the price/.test(text)) { const m = moneyOf(j); return m.paidPence - m.refundedPence - m.pricePence > 0 ? null : 'no longer overpaid'; }
    if (gone) return 'the survey was cancelled';
    /* Paid in full and reported: nothing left on this survey for a system to-do to chase. */
    if (j.paid_at && (j.survey_sent_at || j.report_ready_at)) return 'the survey is finished';
    /* Report ready counts as reported everywhere (the owner's review, 13 Nov 2026). */
    if (t.set_by_name === 'Report check') return j.report_ready_at || j.survey_sent_at ? 'the report went' : !j.report_submitted_at ? 'the surveyor took it back' : null;
    /* A move asked for on their page is done once it is moved or no longer asked. */
    if (t.set_by_name === 'Their page' && /asked to move/.test(text)) return moveAsked(j) ? null : 'moved or no longer asked';
    if (t.set_by_name === 'Website' && /new link/.test(text) && j.portal_issued_at && new Date(j.portal_issued_at) > new Date(t.created_at)) return 'a new link was made';
    const booked = j.date_set && j.job_time && !j.awaiting_agent && !j.pencil_date;
    const fact = SETTLED.find(([f, words]) => (f === 'booked' ? booked : f === 'survey_sent_at' ? j.survey_sent_at || j.report_ready_at : j[f]) && words.test(text));
    if (fact) return 'done on the survey';
  }
  if (lead && !j && lead.closed_at) return 'the enquiry was closed';
  if (t.set_by_name === 'Texts' && laterText) return 'a later text went through';
  return null;
}

/** Close every open system to-do that is done now; returns how many. */
export async function sweepSystemTodos({ jobId = null } = {}) {
  const open = await query(`select t.id, t.text, t.set_by_name, t.job_id, t.lead_id, t.created_at from todos t
      where t.done_at is null and t.set_by_name = any($1::text[]) and (t.job_id is not null or t.lead_id is not null)
        and ($2::bigint is null or t.job_id = $2)`, [SYSTEM, jobId]);
  let n = 0;
  for (const t of open) {
    const [j] = t.job_id ? await query(`select j.*, ${MONEY} from jobs j where j.id = $1`, [t.job_id]) : [null];
    const [lead] = t.lead_id ? await query('select id, closed_at from leads where id = $1', [t.lead_id]).catch(() => [null]) : [null];
    const [later] = t.set_by_name === 'Texts' ? await query(`select 1 from sms_outbox where status in ('sent', 'delivered') and sent_at > $1
        and ((job_id is not null and job_id = $2) or (lead_id is not null and lead_id = $3)) limit 1`, [t.created_at, t.job_id, t.lead_id]) : [null];
    const why = doneBecause(t, j, lead, Boolean(later));
    if (!why) continue;
    await query('update todos set done_at = now() where id = $1 and done_at is null', [t.id]);
    n += 1;
  }
  return n;
}
