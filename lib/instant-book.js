/**
 * Booked straight away online (the owners' choice, 13 Nov 2026, once the
 * texts and payments are live): with the Lab's "Book it straight away" switch
 * on, a time picked on the website becomes a real booking as soon as the
 * customer has chosen their survey, through the very path Scheduling's Book
 * it in takes (the jobs route, then the one carry-over in lib/lead-booked.js
 * and the extras), so the surveyor is told and the customer gets the booked
 * text with the deposit link (lib/texts.js) like any other booking.
 *
 * It stays a request, for the team to confirm by phone as before, when the
 * customer is not sure which survey, or the survey they chose (its rate card
 * minutes and any extras) no longer fits the time they picked.
 */
import { query, queryOne } from './db.js';
import { labFlag } from './availability.js';
import { clashFor } from './scheduling.js';
import { surveyMinutes } from './travel-guard.js';
import { afterLeadBooked } from './lead-booked.js';
import { applyExtras } from './book-extras.js';
import { callRoute } from './mcp/shared.js';
import jobs from './routes/admin/jobs.js';
import { notify } from './notify.js';
import { brandName, customer } from './alert-words.js';
import { textOwners } from './staff-sms.js';

export const instantOn = () => labFlag('instant_booking');
/* Who the booking is made as: the website, with the owners' reach for both damp brands. */
const WEBSITE = { personId: null, name: 'Website', isAdmin: true, businesses: ['dampscan', 'ati-london'], levels: {} };
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;

/**
 * Books the enquiry's website-picked time if it can. Returns { booked: true },
 * or { booked: false, why } when it stays a request (and says so on its card).
 */
export async function confirmOnline(leadId) {
  if (!(await instantOn())) return { booked: false, why: 'off' };
  const l = await queryOne(`select id, site, first_name, postcode, phone, email, survey_choice, pencil_date::text as date, to_char(pencil_time, 'HH24:MI') as time,
      pencil_surveyor as surveyor, pencil_by from leads where id = $1 and closed_at is null and not exists (select 1 from jobs j where j.lead_id = leads.id)`, [leadId]);
  if (!l || !l.date || !l.time || !l.surveyor || l.pencil_by !== 'Website') return { booked: false, why: 'no_pick' };
  const choice = typeof l.survey_choice === 'string' ? JSON.parse(l.survey_choice) : l.survey_choice;
  if (!choice || !choice.key) return { booked: false, why: 'no_survey' };
  const minutes = await surveyMinutes({ leadId: Number(l.id) });
  const clash = await clashFor(l.surveyor, l.date, l.time, null, l.postcode, minutes);
  if (clash) {
    await query(`update leads set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`, [l.id, JSON.stringify([{ at: new Date().toISOString(), by: 'Website',
      how: 'note', note: `Not booked straight away: a ${minutes} minute survey does not fit ${nice(l.date, l.time)} (${clash}) Call to agree a time.` }])]);
    return { booked: false, why: 'does_not_fit' };
  }
  const out = await callRoute(jobs, WEBSITE, { method: 'POST', url: '/api/admin/jobs', body: {
    site: l.site, leadId: Number(l.id), surveyor: l.surveyor, surveyType: choice.key, jobDate: l.date, jobTime: l.time, status: 'booked',
    customerName: l.first_name, customerPostcode: l.postcode, ...(l.phone ? { customerPhone: l.phone } : {}), ...(l.email ? { customerEmail: l.email } : {}) } });
  if (out.status >= 400 || (out.data && out.data.ok === false)) return { booked: false, why: 'refused' };
  await afterLeadBooked({ leadId: Number(l.id), surveyor: l.surveyor, date: l.date, time: l.time });
  const job = await queryOne('select id from jobs where lead_id = $1 order by id desc limit 1', [l.id]);
  if (job && (choice.addOns || []).length) await applyExtras(job.id, { surveyType: choice.key, extras: choice.addOns.map((a) => a.key) });
  const who = l.surveyor[0].toUpperCase() + l.surveyor.slice(1);
  await notify({ business: l.site, kind: 'enquiry', ref: Number(l.id), tags: 'white_check_mark', priority: 4, path: `/schedule.html#lead-${l.id}`,
    title: `Booked online: ${brandName(l.site)}`, message: `${customer(l.first_name, l.postcode, ' in ')} booked ${nice(l.date, l.time)} with ${who}.` });
  await textOwners(`${brandName(l.site)}: ${String(l.first_name || 'Someone').split(' ')[0]} (${String(l.postcode || '').split(' ')[0]}) booked ${nice(l.date, l.time)} online with ${who}.`);
  return { booked: true, jobId: job ? Number(job.id) : null };
}
