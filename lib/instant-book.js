/**
 * Booked straight away online (the owners' choice, 13 Nov 2026, once the
 * texts and payments are live): with the Lab's "Book it straight away"
 * switch on, the customer chooses their survey first (its size and extras set
 * the time on site), is offered only the times that fit it exactly, and the
 * time they tap is booked there and then, right first time, through the very
 * path Scheduling's Book it in takes (the jobs route, then the one carry-over
 * in lib/lead-booked.js and the extras): the surveyor is told and the
 * customer gets the booked text with the deposit link (lib/texts.js). There is
 * no request stage: a time taken a moment before is refused and the fresh
 * times shown.
 */
import { query, queryOne } from './db.js';
import { labFlag } from './availability.js';
import { afterLeadBooked } from './lead-booked.js';
import { applyExtras } from './book-extras.js';
import { callRoute } from './mcp/shared.js';
import jobs from './routes/admin/jobs.js';
import { notify } from './notify.js';
import { brandName, customer } from './alert-words.js';
import { textOwners } from './staff-sms.js';
import { flushDue } from './texts.js';

export const instantOn = () => labFlag('instant_booking');
/* Who the booking is made as: the website, with the owners' reach for both damp brands. */
const WEBSITE = { personId: null, name: 'Website', isAdmin: true, businesses: ['dampscan', 'ati-london'], levels: {} };
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;

/**
 * Books the customer's picked time (the caller has checked it fits the survey
 * they chose, at its real length). Returns { booked: true, jobId }, or
 * { booked: false } when it could not be saved, for the page to offer the
 * times again; never a request for the team to confirm.
 */
export async function bookOnline(lead, { date, time, surveyor }) {
  const l = await queryOne(`select id, site, first_name, postcode, phone, email, survey_choice from leads
      where id = $1 and closed_at is null and not exists (select 1 from jobs j where j.lead_id = leads.id)`, [lead.id]);
  if (!l) return { booked: false };
  const choice = typeof l.survey_choice === 'string' ? JSON.parse(l.survey_choice) : l.survey_choice;
  if (!choice || !choice.key) return { booked: false };
  const out = await callRoute(jobs, WEBSITE, { method: 'POST', url: '/api/admin/jobs', body: {
    site: l.site, leadId: Number(l.id), surveyor, surveyType: choice.key, jobDate: date, jobTime: time, status: 'booked',
    customerName: l.first_name, customerPostcode: l.postcode, ...(l.phone ? { customerPhone: l.phone } : {}), ...(l.email ? { customerEmail: l.email } : {}) } });
  if (out.status >= 400 || (out.data && out.data.ok === false)) return { booked: false };
  await afterLeadBooked({ leadId: Number(l.id), surveyor, date, time });
  const job = await queryOne('select id from jobs where lead_id = $1 order by id desc limit 1', [l.id]);
  if (job && (choice.addOns || []).length) await applyExtras(job.id, { surveyType: choice.key, extras: choice.addOns.map((a) => a.key) });
  if (job) await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`, [job.id, JSON.stringify([{ at: new Date().toISOString(), by: 'Website',
    how: 'note', note: `Booked online for ${nice(date, time)}: ${choice.name}${choice.unsure ? ' (not sure which survey: talk timber through when you call)' : ''}.` }])]);
  /* The customer booked it, so their text goes now, not after the staff's two minutes (and the thanks for the enquiry is dropped). */
  if (job) {
    await query("update sms_outbox set send_after = now() where job_id = $1 and kind = 'booked' and status = 'waiting'", [job.id]);
    await flushDue({ limit: 3 }).catch(() => {});
  }
  const who = surveyor[0].toUpperCase() + surveyor.slice(1);
  await notify({ business: l.site, kind: 'enquiry', ref: Number(l.id), tags: 'white_check_mark', priority: 4, path: `/schedule.html#lead-${l.id}`,
    title: `Booked online: ${brandName(l.site)}`, message: `${customer(l.first_name, l.postcode, ' in ')} booked ${nice(date, time)} with ${who}.` });
  await textOwners(`${brandName(l.site)}: ${String(l.first_name || 'Someone').split(' ')[0]} (${String(l.postcode || '').split(' ')[0]}) booked ${nice(date, time)} online with ${who}.`);
  return { booked: true, jobId: job ? Number(job.id) : null };
}
