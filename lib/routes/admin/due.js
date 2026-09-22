/**
 * GET /api/admin/due?site=
 *
 * What needs doing, across every business the viewer may see, in the order
 * a morning goes: enquiries nobody has turned into a job, the visits today
 * and this week, quotes out with no answer, services falling due, money
 * owed, payouts ready to freeze, and frozen figures that have drifted. Each row carries enough to
 * act on and a link to where the action is.
 *
 * Everything is scoped in SQL, like every other list. A worker sees their
 * business's rows; the money sections need manage or admin, because a
 * worker's view of a job stops at their own payout.
 */
import { query } from '../../db.js';
import { json, requireMethod } from '../../http.js';
import { requireScope, sitesFor } from '../../access.js';
import { normaliseSite } from '../../site.js';
import { TODAY } from '../../today.js';
import { businessFor, present } from '../../quoted.js';

export const config = { runtime: 'nodejs' };

const N = (v) => Number(v) || 0;
const day = (v) => (v == null ? null : String(v).slice(0, 10));
const time = (v) => (v ? String(v).slice(0, 5) : null);
const LIMIT = 60;

/** Complete enquiries from the last month that no job refers to. */
async function enquiries(sites) {
  const rows = await query(
    `select l.id, l.site, l.created_at, l.first_name, l.postcode, l.issues
       from leads l
      where l.site = any($1::text[]) and l.stage = 'complete' and l.created_at >= now() - interval '30 days'
        and not exists (select 1 from jobs j where j.lead_id = l.id)
      order by l.created_at desc limit ${LIMIT}`, [sites]);
  return rows.map((r) => ({ id: Number(r.id), site: r.site, createdAt: r.created_at, firstName: r.first_name, postcode: r.postcode, issues: r.issues || [] }));
}

/** Booked visits from today to a week out, soonest first. */
async function visits(sites) {
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

/** Quotes out with no answer, oldest first. */
async function quotes(sites) {
  const rows = await query(
    `select j.id, j.site, j.created_at, j.customer_name, j.customer_postcode, j.invoice_net_pence,
            (${TODAY} - (j.created_at at time zone 'Europe/London')::date) as age
       from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and b.payout_model <> 'damp' and j.status = 'quoted'
      order by j.created_at limit ${LIMIT}`, [sites]);
  return rows.map((r) => ({ id: Number(r.id), site: r.site, customerName: r.customer_name, postcode: r.customer_postcode, invoicePence: N(r.invoice_net_pence), ageDays: N(r.age) }));
}

/** Money owed: damp surveys done and unpaid, quoted work not paid in full past its date. */
async function owed(sites) {
  const damp = await query(
    `select j.id, j.site, j.job_date::text as job_date, j.customer_name, j.customer_postcode, j.survey_price_pence, j.remedial_pence, j.deposit_paid_at
       from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and b.payout_model = 'damp' and j.status = 'completed' and j.paid_at is null
      order by j.job_date limit ${LIMIT}`, [sites]);
  const quoted = await query(
    `select j.id, j.site, j.job_date::text as job_date, j.customer_name, j.customer_postcode, j.invoice_net_pence, coalesce(r.received, 0) as received
       from jobs j join businesses b on b.slug = j.site
       left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
      where j.site = any($1::text[]) and b.payout_model <> 'damp' and j.status in ('booked', 'completed')
        and j.invoice_net_pence > coalesce(r.received, 0) and (j.status = 'completed' or j.job_date < ${TODAY})
      order by j.job_date limit ${LIMIT}`, [sites]);
  const price = (r) => N(r.survey_price_pence) + N(r.remedial_pence);
  return [
    ...damp.map((r) => ({ id: Number(r.id), site: r.site, jobDate: day(r.job_date), customerName: r.customer_name, postcode: r.customer_postcode, quoted: false,
      owedPence: price(r) - (r.deposit_paid_at ? Math.ceil(N(r.survey_price_pence) / 2) : 0) })),
    ...quoted.map((r) => ({ id: Number(r.id), site: r.site, jobDate: day(r.job_date), customerName: r.customer_name, postcode: r.customer_postcode, quoted: true,
      owedPence: N(r.invoice_net_pence) - N(r.received) }))
  ].sort((a, b) => String(a.jobDate).localeCompare(String(b.jobDate)));
}

/** Service contracts due in the next month, or overdue, soonest first. */
async function services(sites) {
  const rows = await query(
    `select c.id, c.business_slug, c.job_id, c.customer_name, c.customer_postcode, c.next_due_on::text as next_due_on,
            c.last_contacted_on::text as last_contacted_on, c.unit_count, (c.next_due_on - ${TODAY}) as days
       from service_contracts c
      where c.business_slug = any($1::text[]) and c.status = 'active' and c.next_due_on <= ${TODAY} + 30
      order by c.next_due_on, c.id limit ${LIMIT}`, [sites]);
  return rows.map((r) => ({ id: Number(r.id), site: r.business_slug, jobId: r.job_id == null ? null : Number(r.job_id), customerName: r.customer_name,
    postcode: r.customer_postcode, nextDueOn: r.next_due_on, lastContactedOn: r.last_contacted_on, unitCount: N(r.unit_count), daysUntilDue: N(r.days) }));
}

/** Paid in full and not yet frozen, and frozen figures a late line has moved. */
async function payouts(sites) {
  const rows = await query(
    `select j.*, coalesce(r.received, 0) as received
       from jobs j join businesses b on b.slug = j.site
       left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
      where j.site = any($1::text[]) and b.payout_model <> 'damp' and j.status not in ('cancelled', 'declined', 'refunded')
        and ((j.payout_frozen_at is null and j.invoice_net_pence > 0 and coalesce(r.received, 0) >= j.invoice_net_pence)
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

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  const url = new URL(req.url, 'http://localhost');
  const sites = sitesFor(scope, normaliseSite(url.searchParams.get('site')));
  /* Money is for whoever manages the business, or an admin. */
  const moneySites = sites.filter((s) => scope.isAdmin || scope.levels[s] === 'manage');
  try {
    const [e, v, q, sv, o, p] = await Promise.all([enquiries(sites), visits(sites), quotes(sites), services(sites), owed(moneySites), payouts(moneySites)]);
    json(res, 200, { ok: true, sites, money: moneySites.length > 0, enquiries: e, visits: v, quotes: q, services: sv, owed: o, ready: p.ready, drifted: p.drifted });
  } catch (err) {
    console.error('due request failed:', err.message);
    json(res, 500, { ok: false, error: 'due_failed' });
  }
}
