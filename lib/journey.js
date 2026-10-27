/**
 * Where a damp customer is, in one word, worked out the same way for every
 * page (the pop-up, Leads, Scheduling), so no two pages can disagree:
 *
 *   New, Contacted, Waiting for time, Pencilled   (an enquiry, or a job with no time)
 *   Booked, Surveyed, Report sent, Paid            (a job with its day)
 *   Closed, Cancelled
 *
 * And the dots joined after any change to a job: a to-do about something
 * that has now happened (the deposit, the booking, the report, the money)
 * ticks itself off, so the list only holds what is still to do.
 */
import { query } from './db.js';

const london = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const live = (until) => until == null || new Date(until) > new Date();

/** A job row (jobs columns) to its stage. */
export function jobStage(j, today = london()) {
  if (['cancelled', 'declined'].includes(j.status)) return 'Cancelled';
  if (j.paid_at) return 'Paid';
  if (j.survey_sent_at) return 'Report sent';
  const day = j.job_date ? String(j.job_date instanceof Date ? j.job_date.toISOString() : j.job_date).slice(0, 10) : null;
  if (j.date_set && day && (j.status === 'completed' || day < today)) return 'Surveyed';
  if (j.date_set && day && j.job_time && !j.awaiting_agent) return 'Booked';
  if (j.pencil_date && live(j.pencil_until)) return 'Pencilled';
  return 'Waiting for time';
}

/** An enquiry row (leads columns) with no job yet to its stage. */
export function leadStage(l) {
  if (l.closed_at) return 'Closed';
  if (l.pencil_date && live(l.pencil_until)) return 'Pencilled';
  return { contacted: 'Contacted', waiting: 'Waiting for time' }[l.sched_stage] || 'New';
}

/* What each fact settles, by the words a to-do about it uses. */
const SETTLED = [
  ['deposit_paid_at', /deposit/i],
  ['paid_at', /paid in full|balance|chase (the )?pay|payment|unpaid|owed/i],
  ['survey_sent_at', /report/i],
  ['booked', /\bbook|offer (another |a )?time|time to offer|call back|pencil/i]
];

/** Ticks off a job's open to-dos that its facts have overtaken. Returns how many. */
export async function tickSettled(jobId) {
  const [j] = await query(`select deposit_paid_at, paid_at, survey_sent_at, (date_set and job_time is not null and not coalesce(awaiting_agent, false)) as booked
                             from jobs where id = $1`, [jobId]);
  if (!j) return 0;
  const open = await query('select id, text from todos where job_id = $1 and done_at is null', [jobId]);
  const done = open.filter((t) => SETTLED.some(([fact, words]) => j[fact] && words.test(t.text))).map((t) => Number(t.id));
  if (done.length) await query('update todos set done_at = now() where id = any($1::bigint[])', [done]);
  return done.length;
}
