/**
 * The sections of the Due list, each one query (or two) scoped to the sites
 * it is given. They live here rather than in the Due route so the calendar's
 * "Action needed" list and the assistant's what_needs_doing read the very
 * same rows the Due page shows, with no second copy of the SQL to drift.
 * Callers decide which sites count for money; these trust what they are given.
 */
import { query } from './db.js';
import { TODAY } from './today.js';
import { businessFor, present } from './quoted.js';
import { dueMessage, messageFor, YEARLY_FROM_DAY } from './messages.js';
import { londonToday } from './pipeline.js';
import { brandFor } from './brands.js';
import { GROSS_SQL } from './roofing.js';

const N = (v) => Number(v) || 0;
const day = (v) => (v == null ? null : String(v).slice(0, 10));
const time = (v) => (v ? String(v).slice(0, 5) : null);
const LIMIT = 60;

/** Complete enquiries from the last month that no job refers to. */
export async function enquiries(sites) {
  const rows = await query(
    `select l.id, l.site, l.created_at, l.first_name, l.postcode, l.issues
       from leads l
      where l.site = any($1::text[]) and l.stage = 'complete' and l.created_at >= now() - interval '30 days'
        and l.closed_at is null and not exists (select 1 from jobs j where j.lead_id = l.id)
      order by l.created_at desc limit ${LIMIT}`, [sites]);
  return rows.map((r) => ({ id: Number(r.id), site: r.site, createdAt: r.created_at, firstName: r.first_name, postcode: r.postcode, issues: r.issues || [] }));
}

/** Booked visits from today to a week out, soonest first. */
export async function visits(sites) {
  const rows = await query(
    `select j.id, j.site, j.job_date::text as job_date, j.job_time, j.customer_name, j.customer_postcode, b.payout_model,
            j.survey_price_pence, j.invoice_net_pence
       from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and j.status = 'booked' and j.job_date between ${TODAY} and ${TODAY} + 7
      order by j.job_date, j.job_time nulls last, j.id limit ${LIMIT}`, [sites]);
  return rows.map((r) => ({
    id: Number(r.id), site: r.site, jobDate: day(r.job_date), jobTime: time(r.job_time), customerName: r.customer_name,
    postcode: r.customer_postcode, quoted: r.payout_model !== 'damp', valuePence: N(r.payout_model === 'damp' ? r.survey_price_pence : r.invoice_net_pence)
  }));
}

/** Quotes out: the accepted ones waiting for a date, then the unanswered, oldest first. */
export async function quotes(sites) {
  const rows = await query(
    `select j.id, j.site, j.created_at, j.customer_name, j.customer_postcode, j.invoice_net_pence, j.quote_accepted_at,
            (${TODAY} - (j.created_at at time zone 'Europe/London')::date) as age
       from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and b.payout_model <> 'damp' and j.status = 'quoted'
      order by j.quote_accepted_at nulls last, j.created_at limit ${LIMIT}`, [sites]);
  /* An accepted quote is not waiting on the customer any more, it is waiting
     on us for a date, so it leads the list. */
  return rows.map((r) => ({ id: Number(r.id), site: r.site, customerName: r.customer_name, postcode: r.customer_postcode, invoicePence: N(r.invoice_net_pence),
    ageDays: N(r.age), acceptedAt: r.quote_accepted_at }));
}

/**
 * Customer messages waiting to go, from the quoted trades. Only jobs that
 * could be waiting are read: a quote out three days or more, work tomorrow,
 * or work finished in the last two months. lib/messages.js decides which.
 */
export async function messages(sites) {
  const rows = await query(
    `select j.id, j.site, j.status, j.customer_name, j.customer_postcode, j.customer_phone, j.customer_email,
            j.quote_token, j.quote_sent_at, j.job_date::text as job_date, j.job_time, j.rating_token,
            exists (select 1 from job_ratings r where r.job_id = j.id) as rated,
            exists (select 1 from service_contracts c where c.status = 'active' and (c.job_id = j.id or (c.business_slug = j.site
              and lower(c.customer_name) = lower(j.customer_name) and upper(replace(c.customer_postcode, ' ', '')) = upper(replace(j.customer_postcode, ' ', ''))))) as on_plan
       from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and b.payout_model <> 'damp'
        and ((j.status = 'quoted' and j.quote_sent_at <= now() - interval '3 days')
          or (j.status = 'booked' and j.job_date = ${TODAY} + 1)
          or (j.status in ('completed', 'paid') and j.updated_at >= now() - interval '60 days')
          /* A year on, for the yearly check; lib/messages.js decides the window. */
          or (j.status in ('completed', 'paid') and j.job_date <= ${TODAY} - ${YEARLY_FROM_DAY}
              and (${TODAY} - j.job_date) % 365 >= ${YEARLY_FROM_DAY}))
      order by j.id desc limit ${LIMIT * 4}`, [sites]);
  if (!rows.length) return [];
  const sent = await query('select job_id, kind, channel, sent_at from job_messages where job_id = any($1::bigint[])', [rows.map((r) => r.id)]);
  const today = londonToday();
  const out = [];
  for (const r of rows) {
    const brand = brandFor(r.site);
    const job = {
      site: r.site, status: r.status, customerName: r.customer_name, customerPostcode: r.customer_postcode,
      customerPhone: r.customer_phone, customerEmail: r.customer_email, quoteSentAt: r.quote_sent_at,
      quoteUrl: r.quote_token && brand ? `${brand.origin}/quote.html?t=${r.quote_token}` : null, jobDate: day(r.job_date), jobTime: time(r.job_time),
      ratingUrl: r.rating_token && brand ? `${brand.origin}/rate.html?t=${r.rating_token}` : null, rated: r.rated, onPlan: r.on_plan
    };
    const mine = sent.filter((m) => String(m.job_id) === String(r.id)).map((m) => ({ kind: m.kind, channel: m.channel, sentAt: m.sent_at }));
    const message = dueMessage(job, mine, today);
    if (message) out.push({ id: Number(r.id), site: r.site, customerName: r.customer_name, postcode: r.customer_postcode, message });
  }
  const order = { reminder: 0, followup: 1, rating: 2, review: 2, yearly: 3 };
  return out.sort((a, b) => order[a.message.kind] - order[b.message.kind]).slice(0, LIMIT);
}

/** Money owed: damp surveys done and unpaid, quoted work not paid in full past its date. */
export async function owed(sites) {
  const damp = await query(
    `select j.id, j.site, j.job_date::text as job_date, j.customer_name, j.customer_postcode, j.survey_price_pence, j.remedial_pence, j.deposit_paid_at
       from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and b.payout_model = 'damp' and j.paid_at is null
        /* A survey whose day has passed is owed even while still marked booked:
           nothing moves it on until money comes in, so it used to fall between
           the deposit list (future surveys) and this one (completed). */
        and (j.status = 'completed' or (j.status = 'booked' and j.job_date < ${TODAY} and not j.awaiting_agent))
      order by j.job_date limit ${LIMIT}`, [sites]);
  const quoted = await query(
    `select j.id, j.site, j.job_date::text as job_date, j.customer_name, j.customer_postcode, ${GROSS_SQL} as gross, coalesce(r.received, 0) as received
       from jobs j join businesses b on b.slug = j.site
       left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
      where j.site = any($1::text[]) and b.payout_model <> 'damp' and j.status in ('booked', 'completed')
        and ${GROSS_SQL} > coalesce(r.received, 0) and (j.status = 'completed' or j.job_date < ${TODAY})
      order by j.job_date limit ${LIMIT}`, [sites]);
  const price = (r) => N(r.survey_price_pence) + N(r.remedial_pence);
  return [
    ...damp.map((r) => ({ id: Number(r.id), site: r.site, jobDate: day(r.job_date), customerName: r.customer_name, postcode: r.customer_postcode, quoted: false,
      owedPence: price(r) - (r.deposit_paid_at ? Math.ceil(N(r.survey_price_pence) / 2) : 0) })),
    ...quoted.map((r) => ({ id: Number(r.id), site: r.site, jobDate: day(r.job_date), customerName: r.customer_name, postcode: r.customer_postcode, quoted: true,
      owedPence: N(r.gross) - N(r.received) }))
  ].sort((a, b) => String(a.jobDate).localeCompare(String(b.jobDate)));
}

/** Service contracts and maintenance plans due in the next month, or overdue, soonest first. */
export async function services(sites) {
  const rows = await query(
    `select c.id, c.business_slug, c.job_id, c.customer_name, c.customer_postcode, c.next_due_on::text as next_due_on,
            c.last_contacted_on::text as last_contacted_on, c.unit_count, (c.next_due_on - ${TODAY}) as days,
            j.customer_phone, j.customer_email,
            coalesce(c.last_contacted_on >= c.next_due_on - 60, false) as reminded
       from service_contracts c left join jobs j on j.id = c.job_id
      where c.business_slug = any($1::text[]) and c.status = 'active' and c.next_due_on <= ${TODAY} + 30
      order by c.next_due_on, c.id limit ${LIMIT}`, [sites]);
  return rows.map((r) => ({ id: Number(r.id), site: r.business_slug, jobId: r.job_id == null ? null : Number(r.job_id), customerName: r.customer_name,
    postcode: r.customer_postcode, nextDueOn: r.next_due_on, lastContactedOn: r.last_contacted_on, unitCount: N(r.unit_count), daysUntilDue: N(r.days),
    /* The visit reminder, for a plan made from a job (the job holds the number). */
    message: r.job_id && !r.reminded ? messageFor('service', { site: r.business_slug, customerName: r.customer_name, customerPhone: r.customer_phone,
      customerEmail: r.customer_email, serviceDueOn: r.next_due_on }) : null }));
}

/** Paid in full and not yet frozen, and frozen figures a late line has moved. */
export async function payouts(sites) {
  const rows = await query(
    `select j.*, coalesce(r.received, 0) as received
       from jobs j join businesses b on b.slug = j.site
       left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
      where j.site = any($1::text[]) and b.payout_model <> 'damp' and j.status not in ('cancelled', 'declined', 'refunded')
        and ((j.payout_frozen_at is null and j.invoice_net_pence > 0 and coalesce(r.received, 0) >= ${GROSS_SQL})
             or j.payout_frozen_at is not null)
      order by j.job_date desc limit ${LIMIT}`, [sites]);
  const ready = [];
  const drifted = [];
  const businesses = new Map();
  for (const row of rows) {
    if (!businesses.has(row.site)) businesses.set(row.site, await businessFor(row.site));
    const job = await present(row, businesses.get(row.site));
    const item = { id: job.id, site: job.site, jobDate: job.jobDate, customerName: job.customerName, postcode: job.customerPostcode, invoicePence: job.invoiceNetPence };
    if (!job.frozen) ready.push({ ...item, owedRows: job.payoutRows.length, owedPence: job.payoutRows.reduce((s, r) => s + r.amountPence, 0) });
    else if (job.frozen.driftPence) drifted.push({ ...item, driftPence: job.frozen.driftPence, frozenAt: job.frozen.at });
  }
  return { ready, drifted };
}
