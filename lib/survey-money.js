/**
 * The job card's money and report controls for ATi and DampScan, managers
 * only (the surveys route checks): Report ready and Hold from the Reports
 * page, and a card refund through Revolut from the job pop-up.
 *
 * Report ready texts the customer (5 or 6, after the usual two minutes);
 * Hold keeps the report locked on their page and texts nothing until it is
 * let go, when the ready text goes if it never went.
 */
import { query, queryOne } from './db.js';
import { moneyOf, refundOwed } from './portal-view.js';
import { refundOnline, refundableOnline, payOnline } from './revolut-pay.js';
import { portalLinkFor } from './portal.js';
import { openedSummary } from './portal-events.js';

export const manages = (scope, site) => Boolean(scope.isAdmin || (scope.levels && scope.levels[site] === 'manage'));

/** Sets Report ready and/or Hold. Returns the sets for the surveys route's write(). */
export function reportSets(body) {
  const sets = [], params = [];
  if (typeof body.ready === 'boolean') {
    params.push(body.ready);
    sets.push(`report_ready_at = case when $${params.length + 1}::boolean then coalesce(report_ready_at, now()) else null end`);
  }
  if (typeof body.hold === 'boolean') {
    params.push(body.hold);
    const n = params.length + 1;
    sets.push(`report_held = $${n}::boolean`);
    /* Let go: the ready text goes now if it never went (it only goes for something recent). */
    if (typeof body.ready !== 'boolean') {
      sets.push(`report_ready_at = case when not $${n}::boolean and (report_ready_at is not null or survey_sent_at is not null)
        and not exists (select 1 from sms_outbox o where o.job_id = jobs.id and o.kind in ('ready', 'ready_paid', 'report') and o.status = 'sent')
        then now() else report_ready_at end`);
    }
  }
  return { sets, params };
}

/** What the job card shows: their page (link and opens), card refunds possible and any refund owed. */
export async function moneyView(id) {
  const j = await queryOne(`select j.*, j.job_date::text as job_day,
      coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
        + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as paid_pence,
      coalesce((select -sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label = 'refund'), 0) as refunded_pence
    from jobs j where j.id = $1`, [id]);
  if (!j) return null;
  const m = moneyOf(j);
  const payments = await query(`select id, amount_pence, label, note, paid_on::text as day, external_ref from job_payments where job_id = $1 order by created_at`, [id]);
  return {
    paidPence: m.paidPence, refundedPence: m.refundedPence, pricePence: m.pricePence,
    owedBackPence: j.status === 'cancelled' ? refundOwed(j, m) : Math.max(0, m.paidPence - m.refundedPence - m.pricePence),
    cardPence: payOnline() ? await refundableOnline(id) : 0,
    reportReady: Boolean(j.report_ready_at || j.survey_sent_at), reportHeld: Boolean(j.report_held),
    page: { link: await portalLinkFor(id), opened: await openedSummary(id) },
    payments: payments.map((p) => ({ id: Number(p.id), pence: Number(p.amount_pence), label: p.label, note: p.note, day: p.day, online: /^revolut/.test(p.external_ref || '') }))
  };
}

/** A card refund, checked: no more than was paid online, and no more than was paid at all. */
export async function refund(id, pence, by) {
  const out = await refundOnline(id, pence, { by });
  if (out.error) return out;
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [id, JSON.stringify([{ at: new Date().toISOString(), by, how: 'note', note: `Refunded £${(out.refunded / 100).toFixed(2)} to their card.` }])]);
  return out;
}
