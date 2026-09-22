/**
 * The bank side of the books: reading lines back, keeping the jobs' paid boxes
 * in step with matched money, and the reconciliation.
 *
 * Every figure here is aggregated in SQL and returned in whole pence, for one
 * set of books at a time. Damp's identity is the partnership's, and the page
 * shows both sides of it:
 *
 *   bank in - bank out  =  Scott + Tom + Ben + tax pot
 *                        + remedial settled offline
 *                        + deposits on jobs not yet paid in full
 *                        + money in not yet matched or split
 *                        + spend not yet split
 *                        + difference
 *
 * where a person's balance is what the paid jobs say they earned plus their
 * signed shares of the bank lines, the tax pot is what the paid jobs set aside
 * less what went to HMRC, and "difference" is the one line that can be nonzero
 * when everything is allocated: bank money matched to paid jobs versus what
 * those jobs are recorded as worth. Nil means every pound is explained.
 *
 * A quoted business's books have their own identity, in quoted-ledger.js, and
 * this file only hands over to it.
 */
import { query, queryOne } from '../db.js';
import { candidateQuotedJobs, syncQuotedPayments, quotedTotals } from './quoted-ledger.js';
import { differenceJobs } from './difference.js';

/* $1 is the reconcile-from date, $2 the books. The reconciliation starts
   where the bank data does unless told otherwise: jobs paid before the first
   imported line are out of scope, which is what stops years of pre-Revolut
   history showing up as unexplained. */
const FROM = `coalesce($1::date, (select min(posted_on) from bank_transactions where books = $2), '-infinity'::date)`;

export const TX_SELECT = `
  select t.*, t.posted_on::text as posted_on_text,
         j.customer_name as job_customer, j.job_date::text as job_date,
         coalesce(nullif(j.survey_price_pence, 0), j.invoice_net_pence, 0) as job_price,
         coalesce(j.paid_at, j.payout_frozen_at) as job_paid_at, j.deposit_paid_at as job_deposit_at
    from bank_transactions t
    left join jobs j on j.id = t.job_id`;

export const ORDER = 't.posted_on desc, t.posted_time desc nulls last, t.id desc';

/* What "needs attention" means differs by books. In damp's every line is
   somebody's or a job's. In a company's, spend is the company's unless it went
   to a person, so only money in and the uncategorised wait for a decision. */
const ATTENTION = {
  damp: `t.job_id is null and cardinality(t.split) = 0 and t.category <> 'transfer'`,
  quoted: `t.job_id is null and cardinality(t.split) = 0 and t.category <> 'transfer' and (t.amount_pence > 0 or t.category = 'other')`
};

export function viewClause(view, model) {
  if (view === 'in') return 't.amount_pence > 0';
  if (view === 'out') return 't.amount_pence < 0';
  if (view === 'all') return 'true';
  return model === 'damp' ? ATTENTION.damp : ATTENTION.quoted;
}

export const VIEW_KEYS = ['attention', 'in', 'out', 'all'];

const legacyShares = (r) => ({
  scott: Number(r.share_scott_pence), tom: Number(r.share_tom_pence), ben: Number(r.share_ben_pence), tax: Number(r.share_tax_pence)
});

export function toRow(r) {
  return {
    id: Number(r.id),
    books: r.books,
    statementId: r.statement_id == null ? null : Number(r.statement_id),
    postedOn: r.posted_on_text || String(r.posted_on).slice(0, 10),
    postedTime: r.posted_time,
    type: r.type,
    description: r.description,
    reference: r.reference,
    counterparty: r.counterparty,
    mcc: r.mcc,
    amountPence: Number(r.amount_pence),
    feePence: Number(r.fee_pence) || 0,
    balancePence: r.balance_pence == null ? null : Number(r.balance_pence),
    category: r.category,
    categoryKind: r.category_kind,
    split: r.split || [],
    splitKind: r.split_kind,
    /* Lines written before shares were a map carry it in the columns. */
    shares: r.shares && Object.keys(r.shares).length ? r.shares : legacyShares(r),
    jobId: r.job_id == null ? null : Number(r.job_id),
    matchKind: r.match_kind,
    job: r.job_id == null ? null : {
      customerName: r.job_customer, jobDate: r.job_date,
      pricePence: Number(r.job_price), paidAt: r.job_paid_at, depositPaidAt: r.job_deposit_at
    },
    ruleKey: r.rule_key
  };
}

export async function statements(books) {
  const rows = await query(
    `select s.id, s.imported_at, s.filename, s.account, s.first_on::text as first_on, s.last_on::text as last_on,
            s.rows_seen, s.rows_added,
            (select count(*) from bank_transactions t where t.statement_id = s.id) as lines
       from bank_statements s where s.books = $1 order by s.imported_at desc, s.id desc limit 50`,
    [books.key]
  );
  return rows.map((r) => ({
    id: Number(r.id), importedAt: r.imported_at, filename: r.filename, account: r.account,
    firstOn: r.first_on, lastOn: r.last_on, rowsSeen: Number(r.rows_seen), rowsAdded: Number(r.rows_added),
    lines: Number(r.lines)
  }));
}

/**
 * Jobs a payment could be for: everything not cancelled in these books'
 * businesses from a little before the reconciliation start, with what the bank
 * has already matched to each.
 */
export async function candidateJobs(from, books) {
  if (books.model !== 'damp') return candidateQuotedJobs(from, books);
  const rows = await query(
    `select j.id, j.job_date::text as job_date, j.customer_name, j.survey_price_pence,
            j.remedial_pence, j.status, j.site, j.paid_at, j.deposit_paid_at,
            l.first_name, coalesce(j.customer_postcode, l.postcode) as postcode,
            coalesce(r.received, 0) as received
       from jobs j
       left join leads l on l.id = j.lead_id
       left join (select job_id, sum(amount_pence) as received
                    from bank_transactions where amount_pence > 0 and job_id is not null
                   group by job_id) r on r.job_id = j.id
      where j.site = any($3::text[]) and j.status <> 'cancelled' and j.job_date >= ${FROM} - 240
      order by j.job_date desc, j.id desc
      limit 400`,
    [from, books.key, books.sites]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    jobDate: r.job_date,
    customerName: r.customer_name,
    firstName: r.first_name,
    postcode: r.postcode,
    site: r.site,
    surveyPricePence: Number(r.survey_price_pence),
    remedialPence: Number(r.remedial_pence),
    receivedPence: Number(r.received),
    paidAt: r.paid_at,
    depositPaidAt: r.deposit_paid_at
  }));
}

/**
 * Once a bank line is matched to a damp job, the bank decides its paid boxes.
 * 'forward' only ever ticks: matching money never unpays a job that was ticked
 * by hand. 'recompute' also unticks, and is used when matched money is taken
 * away again, because the evidence the tick rested on has gone.
 *
 * A tick the bank sets is dated when the money arrived, not when the file was
 * uploaded. That is what lets "reconcile from" put a job on the right side of
 * the line, and it is the truer date anyway.
 *
 * Paid in full also completes the job, as the tick on a client card does, but
 * only once the survey date has arrived: a customer paying up front still has
 * a visit coming and its card belongs on the upcoming board.
 */
export async function syncJobPayments(jobIds, mode = 'forward') {
  const keep = (col) => (mode === 'recompute' ? 'null' : `j.${col}`);
  const arrived = `(r.last_on::timestamp at time zone 'Europe/London')`;
  for (const id of new Set(jobIds.filter((v) => v != null))) {
    await query(
      `update jobs j
          set deposit_paid_at = case when r.received >= ceil(j.survey_price_pence / 2.0)
                                     then coalesce(j.deposit_paid_at, ${arrived}, now()) else ${keep('deposit_paid_at')} end,
              paid_at = case when r.received >= j.survey_price_pence
                             then coalesce(j.paid_at, ${arrived}, now()) else ${keep('paid_at')} end,
              status = case when r.received >= j.survey_price_pence and j.status = 'booked'
                                 and j.job_date <= (now() at time zone 'Europe/London')::date
                            then 'completed' else j.status end,
              updated_at = now()
         from (select coalesce(sum(amount_pence), 0) as received, max(posted_on) as last_on
                 from bank_transactions where job_id = $1 and amount_pence > 0) r
        where j.id = $1 and j.survey_price_pence > 0`,
      [id]
    );
  }
}

/** The right sync for the books: damp's ticks, or a quoted job's payments list. */
export async function syncPayments(books, jobIds, mode = 'forward') {
  if (books.model === 'damp') return syncJobPayments(jobIds, mode);
  return syncQuotedPayments(jobIds);
}

const N = (v) => Number(v) || 0;

export async function totals(from, books) {
  if (books.model !== 'damp') return quotedTotals(from, books);
  const P2 = [from, books.key];
  const P3 = [from, books.key, books.sites];
  const t = await queryOne(
    `select coalesce(sum(amount_pence) filter (where amount_pence > 0), 0) as bank_in,
            coalesce(-sum(amount_pence) filter (where amount_pence < 0), 0) as bank_out,
            coalesce(sum(amount_pence) filter (where amount_pence > 0 and job_id is not null), 0) as job_income,
            coalesce(sum(amount_pence) filter (where amount_pence > 0 and job_id is null and cardinality(split) = 0), 0) as unmatched_in,
            coalesce(sum(amount_pence) filter (where amount_pence < 0 and cardinality(split) = 0), 0) as unsplit_out,
            count(*) filter (where job_id is null and cardinality(split) = 0) as waiting,
            count(*) as lines,
            coalesce(sum(share_scott_pence), 0) as share_scott,
            coalesce(sum(share_tom_pence), 0)   as share_tom,
            coalesce(sum(share_ben_pence), 0)   as share_ben,
            coalesce(sum(share_tax_pence), 0)   as share_tax
       from bank_transactions
      where books = $2 and category <> 'transfer' and posted_on >= ${FROM}`,
    P2
  );
  const p = await queryOne(
    `select coalesce(sum(t.amount_pence), 0) as part_paid
       from bank_transactions t join jobs j on j.id = t.job_id
      where t.books = $2 and t.amount_pence > 0 and j.paid_at is null and t.category <> 'transfer' and t.posted_on >= ${FROM}`,
    P2
  );
  const j = await queryOne(
    `select count(*) as paid_jobs,
            coalesce(sum(pay_scott_pence), 0) as pay_scott,
            coalesce(sum(pay_tom_pence), 0)   as pay_tom,
            coalesce(sum(pay_ben_pence), 0)   as pay_ben,
            coalesce(sum(round(survey_price_pence * tax_bp / 10000.0)
                       + round(remedial_pence * tax_bp / 10000.0)), 0) as tax_set_aside,
            coalesce(sum(survey_price_pence + remedial_pence), 0) as job_value,
            coalesce(sum((remedial_pence - round(remedial_pence * tax_bp / 10000.0))
                       - round((remedial_pence - round(remedial_pence * tax_bp / 10000.0)) * lead_bp / 10000.0)), 0)
              as remedial_offline
       from jobs
      where site = any($3::text[]) and status <> 'cancelled' and paid_at is not null
        and (paid_at at time zone 'Europe/London')::date >= ${FROM}`,
    P3
  );
  const u = await queryOne(
    `select count(*) as unpaid_jobs, coalesce(sum(survey_price_pence + remedial_pence), 0) as unpaid_value
       from jobs where site = any($3::text[]) and status <> 'cancelled' and paid_at is null and job_date >= ${FROM}`,
    P3
  );
  const f = await queryOne(`select (${FROM})::text as from_on`, P2);

  const balances = {
    scott: N(j.pay_scott) + N(t.share_scott),
    tom: N(j.pay_tom) + N(t.share_tom),
    ben: N(j.pay_ben) + N(t.share_ben),
    tax: N(j.tax_set_aside) + N(t.share_tax)
  };
  const partPaid = N(p.part_paid);
  const difference = (N(t.job_income) - partPaid) - N(j.job_value);
  const explained = balances.scott + balances.tom + balances.ben + balances.tax
    + N(j.remedial_offline) + partPaid + N(t.unmatched_in) + N(t.unsplit_out) + difference;

  return {
    model: 'damp',
    from: f.from_on === '-infinity' ? null : f.from_on,
    lines: N(t.lines),
    waiting: N(t.waiting),
    bank: { inPence: N(t.bank_in), outPence: N(t.bank_out), netPence: N(t.bank_in) - N(t.bank_out) },
    jobs: {
      paid: N(j.paid_jobs), paidValuePence: N(j.job_value), matchedIncomePence: N(t.job_income),
      unpaid: N(u.unpaid_jobs), owedPence: N(u.unpaid_value) - partPaid
    },
    earned: { scott: N(j.pay_scott), tom: N(j.pay_tom), ben: N(j.pay_ben), taxSetAside: N(j.tax_set_aside) },
    shares: { scott: N(t.share_scott), tom: N(t.share_tom), ben: N(t.share_ben), tax: N(t.share_tax) },
    balances,
    remedialOfflinePence: N(j.remedial_offline),
    partPaidPence: partPaid,
    unmatchedInPence: N(t.unmatched_in),
    unsplitOutPence: N(t.unsplit_out),
    differencePence: difference,
    // The jobs that make up the difference, so the page can name them rather
    // than leave a number nobody can chase. Empty whenever the difference is.
    differenceJobs: difference === 0 ? [] : await differenceJobs(from, books),
    explainedPence: explained
  };
}
