/**
 * The bank side of a quoted business's books: which jobs a payment can be
 * for, keeping each job's payments list in step with the lines matched to it,
 * and the reconciliation.
 *
 * A limited company's identity is not the damp partnership's. Money in on a
 * paid job is the job's costs plus the tax reserved on it plus what its people
 * are owed plus what the company kept, which is what the freeze writes to the
 * payouts ledger, one row each, adding back to the invoice. So:
 *
 *   bank in - bank out  =  each person: owed from paid jobs, less paid to them
 *                        + tax reserved on paid jobs, less what went to HMRC
 *                        + what the company kept on paid jobs
 *                        + costs on paid jobs, less spend from the bank
 *                        + money received on jobs not yet paid in full
 *                        + money in not yet matched or split
 *                        + difference
 *
 * "costs less spend" is nil when every cost was paid from the account and put
 * on its job. It goes positive when a cost was paid some other way and
 * negative when the account paid for something no paid job carries yet, and
 * either way it says so rather than hiding it in a balance. "difference" is
 * bank money matched to paid jobs against what those jobs invoiced.
 */
import { query, queryOne } from '../db.js';
import { personKey } from './books.js';

const FROM = `coalesce($1::date, (select min(posted_on) from bank_transactions where books = $2), '-infinity'::date)`;
const N = (v) => Number(v) || 0;
const COMPANY = ['costs', 'reserve', 'retained'];

/** Jobs a payment could be for, in the same shape the damp candidates take. */
export async function candidateQuotedJobs(from, books) {
  const rows = await query(
    `select j.id, j.job_date::text as job_date, j.customer_name, j.invoice_net_pence, j.site, j.payout_frozen_at,
            l.first_name, coalesce(j.customer_postcode, l.postcode) as postcode, coalesce(r.received, 0) as received
       from jobs j
       left join leads l on l.id = j.lead_id
       left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
      where j.site = any($3::text[]) and j.status not in ('cancelled', 'declined') and j.job_date >= ${FROM} - 240
      order by j.job_date desc, j.id desc
      limit 400`,
    [from, books.key, books.sites]
  );
  return rows.map((r) => ({
    id: Number(r.id), jobDate: r.job_date, customerName: r.customer_name, firstName: r.first_name, postcode: r.postcode,
    site: r.site, surveyPricePence: N(r.invoice_net_pence), remedialPence: 0, receivedPence: N(r.received),
    paidAt: r.payout_frozen_at, depositPaidAt: null
  }));
}

/**
 * The payments the bank knows about, rebuilt for these jobs from the lines
 * matched to them. A payment a person typed is untouched; one the bank put
 * there carries the line's id and is replaced wholesale, so unmatching or
 * removing an upload takes exactly what matching created and nothing else.
 */
export async function syncQuotedPayments(jobIds) {
  const ids = [...new Set(jobIds.filter((v) => v != null).map(Number))];
  if (!ids.length) return;
  await query('delete from job_payments where bank_txn_id is not null and job_id = any($1::bigint[])', [ids]);
  await query(
    `insert into job_payments (job_id, amount_pence, paid_on, label, note, bank_txn_id)
     select job_id, amount_pence, posted_on, 'payment', left('From the bank: ' || description, 500), id
       from bank_transactions where job_id = any($1::bigint[]) and amount_pence > 0`,
    [ids]
  );
}

export async function quotedTotals(from, books) {
  const P2 = [from, books.key];
  const P3 = [from, books.key, books.sites];
  const t = await queryOne(
    `select coalesce(sum(amount_pence) filter (where amount_pence > 0), 0) as bank_in,
            coalesce(-sum(amount_pence) filter (where amount_pence < 0), 0) as bank_out,
            coalesce(sum(amount_pence) filter (where amount_pence > 0 and job_id is not null), 0) as job_income,
            coalesce(sum(amount_pence) filter (where amount_pence > 0 and job_id is null and cardinality(split) = 0), 0) as unmatched_in,
            coalesce(sum(amount_pence) filter (where amount_pence < 0 and cardinality(split) = 0), 0) as unsplit_out,
            count(*) filter (where job_id is null and cardinality(split) = 0 and (amount_pence > 0 or category = 'other')) as waiting,
            count(*) as lines
       from bank_transactions where books = $2 and category <> 'transfer' and posted_on >= ${FROM}`,
    P2
  );
  const shareRows = await query(
    `select s.key, sum(s.value::bigint) as pence
       from bank_transactions t, jsonb_each_text(t.shares) s
      where t.books = $2 and t.category <> 'transfer' and t.posted_on >= ${FROM}
      group by s.key`,
    P2
  );
  const ledger = await query(
    `select p.person_key, p.person_id, sum(p.amount_pence) as pence
       from payouts p join jobs j on j.id = p.job_id
      where j.site = any($3::text[]) and j.payout_frozen_at is not null
        and (j.payout_frozen_at at time zone 'Europe/London')::date >= ${FROM}
      group by p.person_key, p.person_id`,
    P3
  );
  const paid = await queryOne(
    `select count(*) as n, coalesce(sum(invoice_net_pence), 0) as value from jobs
      where site = any($3::text[]) and payout_frozen_at is not null
        and (payout_frozen_at at time zone 'Europe/London')::date >= ${FROM}`,
    P3
  );
  const p = await queryOne(
    `select coalesce(sum(t.amount_pence), 0) as part_paid
       from bank_transactions t join jobs j on j.id = t.job_id
      where t.books = $2 and t.amount_pence > 0 and j.payout_frozen_at is null and t.category <> 'transfer' and t.posted_on >= ${FROM}`,
    P2
  );
  const u = await queryOne(
    `select count(*) as n, coalesce(sum(j.invoice_net_pence - coalesce(r.received, 0)), 0) as owed
       from jobs j
       left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
      where j.site = any($3::text[]) and j.payout_frozen_at is null
        and j.status not in ('cancelled', 'declined', 'refunded', 'quoted') and j.job_date >= ${FROM}`,
    P3
  );
  const f = await queryOne(`select (${FROM})::text as from_on`, P2);

  const owed = {};
  let reserve = 0; let retained = 0; let costs = 0; let unassigned = 0;
  for (const r of ledger) {
    if (r.person_key === 'reserve') reserve += N(r.pence);
    else if (r.person_key === 'retained') retained += N(r.pence);
    else if (r.person_key === 'costs') costs += N(r.pence);
    else if (r.person_id != null) { const k = personKey(r.person_id); owed[k] = (owed[k] || 0) + N(r.pence); }
    else unassigned += N(r.pence);
  }
  const shares = {};
  for (const r of shareRows) shares[r.key] = N(r.pence);

  const names = Object.fromEntries(books.targets.map((x) => [x.key, x.name]));
  const keys = [...new Set([...books.targets.map((x) => x.key), ...Object.keys(owed), ...Object.keys(shares)])].filter((k) => k !== 'tax');
  const people = keys.map((k) => ({
    key: k, name: names[k] || k, owedPence: owed[k] || 0, paidPence: shares[k] || 0, balancePence: (owed[k] || 0) + (shares[k] || 0)
  }));
  const tax = { reservedPence: reserve, paidPence: shares.tax || 0, balancePence: reserve + (shares.tax || 0) };
  const partPaid = N(p.part_paid);
  const difference = (N(t.job_income) - partPaid) - N(paid.value);
  const costsUnseen = costs + N(t.unsplit_out);
  const explained = people.reduce((s, x) => s + x.balancePence, 0) + tax.balancePence + retained + unassigned
    + costsUnseen + partPaid + N(t.unmatched_in) + difference;

  return {
    model: 'quoted',
    from: f.from_on === '-infinity' ? null : f.from_on,
    lines: N(t.lines),
    waiting: N(t.waiting),
    bank: { inPence: N(t.bank_in), outPence: N(t.bank_out), netPence: N(t.bank_in) - N(t.bank_out) },
    jobs: { paid: N(paid.n), paidValuePence: N(paid.value), matchedIncomePence: N(t.job_income), unpaid: N(u.n), owedPence: N(u.owed) },
    people,
    tax,
    retainedPence: retained,
    unassignedPence: unassigned,
    costs: { recordedPence: costs, fromBankPence: -N(t.unsplit_out), unseenPence: costsUnseen },
    partPaidPence: partPaid,
    unmatchedInPence: N(t.unmatched_in),
    unsplitOutPence: N(t.unsplit_out),
    differencePence: difference,
    differenceJobs: [],
    explainedPence: explained
  };
}

export { COMPANY as COMPANY_KEYS };
