/**
 * The jobs behind damp's "difference" line.
 *
 * Split from ledger.js, which holds the reconciliation itself, when this took
 * that file past the 300 line limit the rest of the project keeps to.
 */
import { query } from '../db.js';

/* $1 is the reconcile-from date, $2 the books, as in ledger.js. */
const FROM = `coalesce($1::date, (select min(posted_on) from bank_transactions where books = $2), '-infinity'::date)`;
const N = (v) => Number(v) || 0;

/**
 * The jobs behind damp's "difference" line, worst first.
 *
 * The difference is one sum spread over jobs: for every job the bank has
 * ticked as paid, the money matched to it inside the window against what the
 * job itself is recorded as worth. A job only shows up here when those two
 * disagree, and short of more offenders than the limit the deltas add back to
 * exactly differencePence, so the list is the whole of the difference rather
 * than a hint at it. Square jobs sort last, so the limit sheds those first.
 *
 * The value side is counted on the same terms as the reconciliation: nil for a
 * cancelled job, and nil for one paid before the window opened, whose money is
 * out of scope but whose price would otherwise be counted in full. Those two
 * are the usual causes, alongside a price edited after the money arrived and a
 * second line matched to a job that was already square.
 */
export async function differenceJobs(from, books, limit = 50) {
  const counted = `case when j.status <> 'cancelled' and (j.paid_at at time zone 'Europe/London')::date >= ${FROM}
                        then j.survey_price_pence + j.remedial_pence else 0 end`;
  const rows = await query(
    `with received as (
       select t.job_id, sum(t.amount_pence) as received, count(*) as lines
         from bank_transactions t
        where t.books = $2 and t.amount_pence > 0 and t.job_id is not null
          and t.category <> 'transfer' and t.posted_on >= ${FROM}
        group by t.job_id
     )
     select j.id, j.job_date::text as job_date, j.customer_name, j.site, j.status,
            (j.paid_at at time zone 'Europe/London')::date::text as paid_on,
            j.survey_price_pence + j.remedial_pence as value,
            coalesce(r.received, 0) as received, coalesce(r.lines, 0) as lines,
            ${counted} as counted_value
       from jobs j
       left join received r on r.job_id = j.id
      where j.site = any($3::text[]) and j.paid_at is not null
      order by abs(coalesce(r.received, 0) - ${counted}) desc, j.job_date desc, j.id desc
      limit ${Number(limit) || 50}`,
    [from, books.key, books.sites]
  );
  return rows
    .map((r) => ({
      id: Number(r.id),
      jobDate: r.job_date,
      customerName: r.customer_name,
      site: r.site,
      status: r.status,
      paidOn: r.paid_on,
      valuePence: N(r.value),
      countedValuePence: N(r.counted_value),
      receivedPence: N(r.received),
      lines: N(r.lines),
      deltaPence: N(r.received) - N(r.counted_value),
      // Why this job is in the list at all, so nobody has to work it out twice.
      reason: r.status === 'cancelled' ? 'cancelled after the money arrived'
        : N(r.counted_value) === 0 ? 'paid before the reconciliation starts'
        : N(r.received) > N(r.counted_value) ? 'more money matched than the job is worth'
        : 'less money matched than the job is worth'
    }))
    .filter((j) => j.deltaPence !== 0);
}
