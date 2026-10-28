/**
 * Where a damp customer is, in one word, worked out the same way for every
 * page (the pop-up, Leads, Scheduling), so no two pages can disagree:
 *
 *   New, Contacted, Waiting for time, Waiting on agent, Pencilled   (no time yet)
 *   Booked, Surveyed, Report sent, Paid            (a job with its day)
 *   Closed, Cancelled
 *
 * And the to-dos about something that has now happened (the deposit, the
 * booking, the report, the money), offered to be cleared, never cleared
 * without asking.
 */
import { query, queryOne } from './db.js';

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
  if (j.awaiting_agent) return 'Waiting on agent';
  if (j.sched_stage === 'cold') return 'Gone cold';
  if (j.sched_stage === 'contacted') return 'Contacted';
  return 'Waiting for time';
}

/** An enquiry row (leads columns) with no job yet to its stage. */
export function leadStage(l) {
  if (l.closed_at) return 'Closed';
  if (l.pencil_date && live(l.pencil_until)) return 'Pencilled';
  return { contacted: 'Contacted', waiting: 'Waiting for time', cold: 'Gone cold' }[l.sched_stage] || 'New';
}

/* What each fact settles, by the words a to-do about it uses. */
const SETTLED = [
  ['deposit_paid_at', /\b(chase|take|collect|get|ask for)\b[^.]*\bdeposit\b|\bdeposit (due|owed|outstanding|not paid)/i],
  ['paid_at', /\b(chase|collect|take|get)\b[^.]*\b(balance|payment|money|paid in full)\b|\bunpaid\b|\bstill (owes|to pay)\b/i],
  ['survey_sent_at', /\b(send|write|finish|email)\b[^.]*\breport\b|\breport (due|overdue|to send)\b/i],
  ['booked', /^(book|offer|find|call back|ring back|phone back|pencil)\b/i]
];

/**
 * A job's open to-dos that its facts look to have overtaken (deposit in,
 * booked, report sent, paid). Nothing is ticked here: the owners chose to be
 * asked, so the pop-up and ChatGPT offer them and the person decides.
 */
export async function settledTodos(jobId) {
  const [j] = await query(`select deposit_paid_at, paid_at, survey_sent_at, (date_set and job_time is not null and not coalesce(awaiting_agent, false)) as booked
                             from jobs where id = $1`, [jobId]);
  if (!j) return [];
  const open = await query('select id, text from todos where job_id = $1 and done_at is null order by id', [jobId]);
  return open.filter((t) => SETTLED.some(([fact, words]) => j[fact] && words.test(t.text))).map((t) => ({ id: Number(t.id), text: t.text }));
}

/* Where each stage sits on the Scheduling page, in words for the assistant. */
const PLACE = {
  New: 'Scheduling, To book board, New enquiry column',
  Contacted: 'Scheduling, To book board, Contacted column',
  'Waiting for time': 'Scheduling, To book board, Waiting for time column',
  'Waiting on agent': 'Scheduling, To book board, Waiting for time column, marked awaiting the estate agent',
  'Gone cold': 'Scheduling, To book board, Gone cold (folded at the end), to try again later',
  Pencilled: 'Scheduling, To book board, with a grey pencilled hold on Today and the day lane',
  Booked: 'off the To book board: on Today, Surveys and Scheduling\'s day lane',
  Surveyed: 'Scheduling, After the visit; on Reports until the report is sent',
  'Report sent': 'Scheduling, After the visit until paid in full',
  Paid: 'done, off the board',
  Closed: 'closed, off the board (still on Leads)',
  Cancelled: 'cancelled, off the board'
};

/** Where an ATi or DampScan job or enquiry is now: its stage and its place on Scheduling. */
export async function whereNow({ jobId = null, leadId = null }) {
  const job = jobId ? await queryOne(`select id, site, status, paid_at, survey_sent_at, date_set, job_date::text as job_date, job_time, awaiting_agent, pencil_date, pencil_until, sched_stage
      from jobs where id = $1 and site in ('dampscan', 'ati-london')`, [jobId])
    : leadId ? await queryOne(`select id, site, status, paid_at, survey_sent_at, date_set, job_date::text as job_date, job_time, awaiting_agent, pencil_date, pencil_until, sched_stage
      from jobs where lead_id = $1 order by id limit 1`, [leadId]) : null;
  if (job) { const stage = jobStage(job); return { stage, scheduling: PLACE[stage] }; }
  if (!leadId) return null;
  const l = await queryOne(`select closed_at, sched_stage, pencil_date, pencil_until from leads where id = $1 and site in ('dampscan', 'ati-london')`, [leadId]);
  if (!l) return null;
  const stage = leadStage(l);
  return { stage, scheduling: PLACE[stage] };
}
