/**
 * One sum for what a damp survey has had in, shared by the customer's page
 * and every owed alert (the owner, 18 Nov 2026: the alerts counted card and
 * hand payments only, today's half price for a deposit tick and missed bank
 * transfers, so a customer could be chased for a figure their page did not show).
 * Paid is the larger of the money recorded and what the ticks stood for when
 * made (lib/portal-view.js moneyOf); remedial work won is owed on top.
 */
import { moneyOf } from './portal-view.js';

/** Money recorded for job `a`: payments in (refunds apart) and matched bank lines. */
export const paidPenceSql = (a = 'j') => `(coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = ${a}.id and p.label <> 'refund'), 0)
  + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = ${a}.id and b.amount_pence > 0), 0))`;

/** The columns moneyOf reads, for a select on jobs `a`. */
export const moneyCols = (a = 'j') => `${a}.survey_price_pence, ${a}.remedial_pence, ${a}.paid_at, ${a}.deposit_paid_at, ${a}.tick_paid_pence, ${a}.tick_deposit_pence, ${paidPenceSql(a)} as paid_pence`;

/** Still owed on a damp survey, as the customer's page would say, plus any remedial work won. */
export const owedPence = (r) => Math.max(0, (Number(r.survey_price_pence) || 0) + (Number(r.remedial_pence) || 0) - moneyOf(r).paidPence);
