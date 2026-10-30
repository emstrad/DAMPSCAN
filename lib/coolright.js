/**
 * The CoolRight install pipeline: where every air conditioning or heat pump
 * job stands, what is missing, and the one next thing to do about it.
 *
 *   enquiry       a finished web enquiry with no job yet (read from leads)
 *   survey        a survey visit booked, no quote out yet
 *   quoted        a quote written or sent, no answer
 *   accepted      the customer said yes; an install date may be booked
 *   installed     the kit is fitted (status completed), not commissioned
 *   commissioned  commissioned (commissioned_on), not paid in full
 *   paid          paid in full
 *
 * As on the Verge board (lib/roofing.js) the stage is derived from facts the
 * job already keeps, so a payment typed on the job screen moves the card
 * without anyone dragging it. "Kit ordered" reuses the roofing planner's
 * materials row (lib/roofing-plan.js), so its cost is one cost line too.
 */
import { query } from './db.js';
import { TODAY } from './today.js';
import { isoDate } from './routes/admin/clients.js';
import { planFor } from './roofing-plan.js';
import { firstName, CHASE_DAYS, PAID_IN_FULL } from './roofing.js';

export const AC_SITES = ['ac'];
export const AC_STAGES = ['enquiry', 'survey', 'quoted', 'accepted', 'installed', 'commissioned', 'paid'];
export const AC_BADGES = {
  survey: 'Survey not booked', quote: 'Quote not sent', deposit: 'Deposit due', kit: 'Kit not ordered', late: 'Install date passed',
  commission: 'Not commissioned', fgas: 'F-gas record missing', unpaid: 'Unpaid', plan: 'Service plan not offered', warranty: 'Warranty ending'
};

export const AC_STAGE_SQL = `case
    when j.status = 'paid' or (j.status = 'completed' and ${PAID_IN_FULL}) then 'paid'
    when j.status = 'completed' and j.commissioned_on is not null then 'commissioned'
    when j.status = 'completed' then 'installed'
    when j.status = 'booked' or j.quote_accepted_at is not null or j.won_at is not null then 'accepted'
    when j.site_visit_on is not null and j.visit_done_at is null and j.quote_sent_at is null then 'survey'
    else 'quoted' end`;

export const AC_SELECT = `
  select j.id, j.site, j.status, j.job_date, j.job_time, j.date_set, j.site_visit_on, j.invoice_net_pence, j.quote_sent_at,
         j.quote_accepted_at, j.won_at, j.payout_frozen_at, j.lead_id, j.note, j.commissioned_on, j.commission_engineer, j.fgas_ref,
         j.leak_check_on, j.pressure_test, j.summer_asked_on,
         j.customer_name, j.customer_postcode, coalesce(j.customer_phone, l.phone) as phone, coalesce(j.customer_email, l.email) as email,
         ${AC_STAGE_SQL} as stage,
         ${TODAY} - coalesce(j.stage_at, j.updated_at, j.created_at)::date as stage_days,
         ${TODAY} as today,
         coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id), 0) as received_pence,
         (select count(*) from ac_units u where u.job_id = j.id) as units,
         (select min(u.warranty_until) from ac_units u where u.job_id = j.id and u.warranty_until >= ${TODAY}) as warranty_until,
         (select array_agg(distinct m.kind) from job_messages m where m.job_id = j.id) as sent_kinds,
         exists (select 1 from service_contracts c where c.job_id = j.id and c.status = 'active') as on_plan
    from jobs j left join leads l on l.id = j.lead_id`;

const N = (v) => Number(v) || 0;
const pounds = (p) => (Math.max(0, p) / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
const short = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const daysTo = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
/* A warranty ending within this many days is flagged on the card and on Today. */
export const WARRANTY_DAYS = 60;

/** What is missing, as badge keys, and the one next action. */
export function acBadgesAndNext(card, r) {
  const b = [];
  const s = card.stage;
  const sent = r.sent_kinds || [];
  const done = ['installed', 'commissioned', 'paid'].includes(s);
  if (s === 'quoted' && !card.siteVisitOn && !r.quote_sent_at) b.push('survey');
  if (s === 'quoted' && !r.quote_sent_at) b.push('quote');
  if (s === 'accepted' && card.receivedPence <= 0) b.push('deposit');
  if (s === 'accepted' && card.kit === 'needed') b.push('kit');
  if (s === 'accepted' && card.status === 'booked' && card.jobDate && card.jobDate < card.today) b.push('late');
  if (done && !card.commissionedOn) b.push('commission');
  if (done && !card.fgasRef) b.push('fgas');
  if (s === 'installed' || s === 'commissioned') b.push('unpaid');
  if (done && !card.onPlan && !sent.includes('yearly') && !sent.includes('summer')) b.push('plan');
  if (card.warrantyUntil && daysTo(card.today, card.warrantyUntil) <= WARRANTY_DAYS) b.push('warranty');
  let next;
  if (s === 'survey') next = card.siteVisitOn && card.siteVisitOn >= card.today ? `Survey ${short(card.siteVisitOn)}` : 'Survey done? Write the quote';
  else if (s === 'quoted') next = !r.quote_sent_at ? (card.siteVisitOn ? 'Send the quote' : 'Book a survey or send the quote') : card.stageDays >= CHASE_DAYS ? 'Chase the quote' : 'Wait for an answer';
  else if (s === 'accepted') {
    if (b.includes('deposit')) next = 'Take the deposit';
    else if (b.includes('kit')) next = 'Order the kit';
    else if (card.status !== 'booked') next = 'Book the install date';
    else next = b.includes('late') ? 'Install date passed: fit it or move it' : `Install ${short(card.jobDate)}`;
  } else if (s === 'installed') next = 'Commission it and record the F-gas details';
  else if (s === 'commissioned') next = `Collect ${pounds(card.valuePence - card.receivedPence)}`;
  else if (!card.commissionedOn || !card.fgasRef) next = 'Record the commissioning and F-gas details';
  else if (!card.onPlan) next = 'Add a service plan';
  else next = 'On a service plan';
  return { badges: b, next };
}

/** One row as a board card, with its kit row from the planner. */
export function toAcCard(r, plan) {
  const card = {
    id: Number(r.id), site: r.site, stage: r.stage, status: r.status, name: r.customer_name || null, firstName: firstName(r.customer_name),
    postcode: r.customer_postcode || null, phone: r.phone || null, email: r.email || null,
    valuePence: N(r.invoice_net_pence), receivedPence: N(r.received_pence), jobDate: isoDate(r.job_date), dateSet: Boolean(r.date_set),
    jobTime: r.job_time ? String(r.job_time).slice(0, 5) : null, siteVisitOn: isoDate(r.site_visit_on),
    stageDays: Math.max(0, N(r.stage_days)), today: isoDate(r.today), acceptedOnline: Boolean(r.quote_accepted_at),
    frozen: Boolean(r.payout_frozen_at), note: r.note || null, units: N(r.units), kit: plan ? plan.materials.status : 'needed',
    commissionedOn: isoDate(r.commissioned_on), engineer: r.commission_engineer || null, fgasRef: r.fgas_ref || null,
    leakCheckOn: isoDate(r.leak_check_on), pressureTest: r.pressure_test || null, warrantyUntil: isoDate(r.warranty_until),
    onPlan: Boolean(r.on_plan), summerAskedOn: isoDate(r.summer_asked_on)
  };
  Object.assign(card, acBadgesAndNext(card, r));
  return card;
}

export async function acCardsFor(rows) {
  const plans = await planFor(rows.map((r) => Number(r.id)));
  return rows.map((r) => toAcCard(r, plans.get(Number(r.id))));
}

/** The whole board: enquiries, then every live job; paid work stays 90 days. */
export async function acBoard(sites) {
  const [rows, leads] = await Promise.all([
    query(`${AC_SELECT}
      where j.site = any($1::text[]) and j.status not in ('declined', 'cancelled', 'refunded')
        and not (j.status in ('completed', 'paid') and j.job_date < ${TODAY} - 90)
      order by j.job_date, j.id limit 500`, [sites]),
    query(`select l.id, l.site, l.created_at, l.first_name, l.postcode, l.phone, l.email, l.issues
             from leads l
            where l.site = any($1::text[]) and l.stage = 'complete' and l.created_at >= now() - interval '60 days'
              and l.closed_at is null and not exists (select 1 from jobs j where j.lead_id = l.id)
            order by l.created_at desc limit 200`, [sites])
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const enquiries = leads.map((l) => ({
    leadId: Number(l.id), site: l.site, stage: 'enquiry', createdAt: l.created_at, firstName: l.first_name || null,
    postcode: l.postcode || null, phone: l.phone || null, email: l.email || null, issues: l.issues || [],
    stageDays: Math.max(0, daysTo(new Date(l.created_at).toISOString().slice(0, 10), today))
  }));
  return { enquiries, jobs: await acCardsFor(rows) };
}

/** One card by id, in these sites, or null. */
export async function acCard(id, sites) {
  const rows = await query(`${AC_SELECT} where j.id = $1 and j.site = any($2::text[])`, [id, sites]);
  return rows[0] ? (await acCardsFor(rows))[0] : null;
}
