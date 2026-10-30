/**
 * The Verge Roofing pipeline: where every roofing job stands, the badge that
 * says what is missing, and the one next thing to do about it.
 *
 *   enquiry      a finished web enquiry with no job yet (read from leads)
 *   visit        a site visit booked, no quote out yet
 *   quoted       a quote written or sent, no answer
 *   accepted     the customer said yes (online, or by phone: won_at)
 *   booked       a start date, not started
 *   in_progress  the crew are on it (started_at)
 *   done         finished, not paid in full
 *   paid         paid in full, no rating yet
 *   reviewed     the customer has rated it
 *
 * Like the damp board (lib/surveys.js) the stage is derived from facts the
 * job already keeps, never stored, so a payment typed on the job screen or a
 * rating left on the website moves the card without anyone touching it.
 * Paid in full is the payments list covering the price, the same test the
 * payout freeze uses, so "paid" here never disagrees with the money.
 */
import { query } from './db.js';
import { TODAY } from './today.js';
import { isoDate } from './routes/admin/clients.js';
import { planFor } from './roofing-plan.js';
import { effectiveVatBp } from './business-details.js';
import { bpOf } from './splits.js';

export const ROOF_SITES = ['roofing'];
export const STAGES = ['enquiry', 'visit', 'quoted', 'accepted', 'booked', 'in_progress', 'done', 'paid', 'reviewed'];
/* A chased quote goes quiet after this many days without an answer. */
export const CHASE_DAYS = 3;

/* What the customer is billed: the net plus VAT at the business's effective
   rate (nought until registered). Paid in full is measured against this, so
   Verge, CoolRight and the job screen agree once VAT is switched on. */
export const GROSS_SQL = `(j.invoice_net_pence + round(j.invoice_net_pence * coalesce((select case when b.vat_registered then coalesce(b.vat_bp, 2000) else 0 end
    from businesses b where b.slug = j.site), 0) / 10000.0))`;
export const grossPence = (netPence, business) => netPence + bpOf(netPence, effectiveVatBp(business));
export const PAID_IN_FULL = `(j.invoice_net_pence > 0 and coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id), 0) >= ${GROSS_SQL})`;
const RATED = 'exists (select 1 from job_ratings r where r.job_id = j.id)';
export const ROOF_STAGE_SQL = `case
    when j.status in ('completed', 'paid') and ${RATED} then 'reviewed'
    when j.status = 'paid' or (j.status = 'completed' and ${PAID_IN_FULL}) then 'paid'
    when j.status = 'completed' then 'done'
    when j.status = 'booked' and j.started_at is not null then 'in_progress'
    when j.status = 'booked' then 'booked'
    when j.quote_accepted_at is not null or j.won_at is not null then 'accepted'
    when j.site_visit_on is not null and j.visit_done_at is null and j.quote_sent_at is null then 'visit'
    else 'quoted' end`;

export const ROOF_SELECT = `
  select j.id, j.site, j.status, j.job_date, j.job_time, j.site_visit_on, j.expected_days, j.invoice_net_pence, j.quote_sent_at,
         j.quote_accepted_at, j.won_at, j.started_at, j.payout_frozen_at, j.lead_id, j.note, j.google_posted_at, j.page_published_at,
         j.customer_name, j.customer_postcode, coalesce(j.customer_phone, l.phone) as phone, coalesce(j.customer_email, l.email) as email,
         ${ROOF_STAGE_SQL} as stage,
         ${TODAY} - coalesce(j.stage_at, j.updated_at, j.created_at)::date as stage_days,
         ${TODAY} as today,
         coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id), 0) as received_pence,
         (select count(*) from job_photos ph where ph.job_id = j.id) as photos,
         (select array_agg(distinct m.kind) from job_messages m where m.job_id = j.id) as sent_kinds,
         exists (select 1 from service_contracts c where c.job_id = j.id and c.status = 'active') as on_plan
    from jobs j left join leads l on l.id = j.lead_id`;

const N = (v) => Number(v) || 0;
const TO_DO = { deposit: 'Take the deposit', scaffold: 'Book the scaffold', materials: 'Order the materials' };
export const firstName = (n) => String(n || '').trim().split(/\s+/).find((w) => !/^(mr|mrs|ms|miss|mx|dr)\.?$/i.test(w)) || null;
const daysTo = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const short = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The finishing checklist for a finished job: each step done or not. */
export function finishSteps(r) {
  const sent = r.sent_kinds || [];
  return [
    { key: 'photos', label: 'Photos uploaded', done: N(r.photos) > 0 },
    { key: 'page', label: 'Website project page', done: Boolean(r.page_published_at) },
    { key: 'rating', label: 'Rating asked for', done: sent.includes('rating') || r.stage === 'reviewed' },
    { key: 'google', label: 'Google post', done: Boolean(r.google_posted_at) },
    { key: 'yearly', label: 'Yearly check offered', done: sent.includes('yearly') || Boolean(r.on_plan) }
  ];
}

/** What is missing, as badge keys, and the one next action. */
export function badgesAndNext(card, plan, r) {
  const b = [];
  const s = card.stage;
  const ready = ['accepted', 'booked'].includes(s);
  if (s === 'quoted' && !r.quote_sent_at) b.push('quote');
  if (ready && card.receivedPence <= 0) b.push('deposit');
  if (ready && plan.scaffold.open) b.push('scaffold');
  if (ready && plan.materials.open) b.push('materials');
  if (s === 'booked' && card.jobDate && card.jobDate < card.today) b.push('late');
  if (s === 'done') b.push('unpaid');
  if (s === 'paid') b.push('review');
  let next;
  if (s === 'visit') next = card.siteVisitOn && card.siteVisitOn >= card.today ? `Site visit ${short(card.siteVisitOn)}` : 'Visit done? Write the quote';
  else if (s === 'quoted') next = !r.quote_sent_at ? 'Send the quote' : card.stageDays >= CHASE_DAYS ? 'Chase the quote' : 'Wait for an answer';
  else if (s === 'accepted') next = card.receivedPence <= 0 ? 'Take the deposit, then book a date' : 'Book a start date';
  else if (s === 'booked') {
    const miss = b.find((k) => ['deposit', 'scaffold', 'materials'].includes(k));
    next = b.includes('late') ? 'Start date passed: start it or move it' : miss ? TO_DO[miss] : `Starts ${short(card.jobDate)}`;
  } else if (s === 'in_progress') next = 'Mark done when the roof is finished';
  else if (s === 'done') next = `Collect ${(Math.max(0, card.valuePence - card.receivedPence) / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}`;
  else if (s === 'paid') next = 'Ask for a rating';
  else {
    const left = (card.finish || []).find((f) => !f.done);
    next = left ? `Finish off: ${left.label.toLowerCase()}` : 'All finished';
  }
  return { badges: b, next };
}

/** One row as a board card. `plans` maps job id to its planner. */
export function toCard(r, plan) {
  const today = isoDate(r.today);
  const card = {
    id: Number(r.id), site: r.site, stage: r.stage, status: r.status, name: r.customer_name || null, firstName: firstName(r.customer_name),
    postcode: r.customer_postcode || null, phone: r.phone || null, email: r.email || null,
    valuePence: N(r.invoice_net_pence), receivedPence: N(r.received_pence), jobDate: isoDate(r.job_date),
    jobTime: r.job_time ? String(r.job_time).slice(0, 5) : null, siteVisitOn: isoDate(r.site_visit_on),
    expectedDays: r.expected_days == null ? null : Number(r.expected_days), stageDays: Math.max(0, N(r.stage_days)), today,
    acceptedOnline: Boolean(r.quote_accepted_at), frozen: Boolean(r.payout_frozen_at), note: r.note || null,
    crew: plan.crew.map((c) => ({ personId: c.personId, name: c.name, initials: c.initials })),
    plan: { scaffold: plan.scaffold.status, materials: plan.materials.status, skip: plan.skip.status }
  };
  if (['done', 'paid', 'reviewed'].includes(r.stage)) card.finish = finishSteps(r);
  Object.assign(card, badgesAndNext(card, plan, r));
  return card;
}

/** Cards for these job rows, with their planners loaded in one go. */
export async function cardsFor(rows) {
  const plans = await planFor(rows.map((r) => Number(r.id)));
  return rows.map((r) => toCard(r, plans.get(Number(r.id))));
}

/** The whole board: enquiries, then every live roofing job; finished work stays 90 days. */
export async function roofBoard(sites) {
  const [rows, leads] = await Promise.all([
    query(`${ROOF_SELECT}
      where j.site = any($1::text[]) and j.status not in ('declined', 'cancelled', 'refunded')
        and not (j.status in ('completed', 'paid') and j.job_date < ${TODAY} - 90)
      order by j.job_date, j.id limit 500`, [sites]),
    query(`select l.id, l.site, l.created_at, l.first_name, l.postcode, l.phone, l.email, l.issues
             from leads l
            where l.site = any($1::text[]) and l.stage = 'complete' and l.created_at >= now() - interval '60 days'
              and l.closed_at is null and not exists (select 1 from jobs j where j.lead_id = l.id)
            order by l.created_at desc limit 200`, [sites])
  ]);
  const enquiries = leads.map((l) => ({
    leadId: Number(l.id), site: l.site, stage: 'enquiry', createdAt: l.created_at, firstName: l.first_name || null,
    postcode: l.postcode || null, phone: l.phone || null, email: l.email || null, issues: l.issues || [],
    stageDays: Math.max(0, daysTo(new Date(l.created_at).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)))
  }));
  return { enquiries, jobs: await cardsFor(rows) };
}

/** One card by id, in these sites, or null. */
export async function roofCard(id, sites) {
  const rows = await query(`${ROOF_SELECT} where j.id = $1 and j.site = any($2::text[])`, [id, sites]);
  return rows[0] ? (await cardsFor(rows))[0] : null;
}

/** Jobs on the roof, or due on it, between two days: the week board. */
export async function roofWeek(sites, from, to) {
  const rows = await query(`${ROOF_SELECT}
      where j.site = any($1::text[]) and j.status in ('booked', 'completed', 'paid')
        and j.job_date <= $3::date and j.job_date + greatest(ceil(coalesce(j.expected_days, 1))::int - 1, 0) * interval '1 day' + interval '3 days' >= $2::date
      order by j.job_date, j.job_time nulls last, j.id limit 300`, [sites, from, to]);
  return cardsFor(rows);
}

/**
 * The working days a job covers from its start, Monday to Saturday: a
 * three-day job starting on a Friday is Friday, Saturday and Monday.
 */
export function workingDays(start, days) {
  const out = [];
  const d = new Date(`${start}T12:00:00Z`);
  const want = Math.max(1, Math.ceil(Number(days) || 1));
  while (out.length < want && out.length < 60) {
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
