/**
 * The one check every way of booking a damp survey goes through (the board,
 * the client card, the Jobs form, ChatGPT): a time inside the drive to or
 * from the surveyor's other surveys that day is refused with the reason,
 * unless the person says go ahead anyway (force). Only future surveys with a
 * surveyor, day and time; typing in a past job is never stopped.
 */
import { query } from './db.js';
import { json } from './http.js';
import { places, blocker, tidy } from './travel.js';
import { londonToday } from './pipeline.js';
import { EXTRA_MINUTES } from '../content/prices.js';

const DAMP = ['dampscan', 'ati-london'];

/**
 * How long the survey being booked takes on site (the timings audit, 13 Nov
 * 2026: every check used to assume an hour, so a two-hour Full House was let
 * in an hour before the next survey). The rate card's minutes for its type,
 * plus EXTRA_MINUTES for each extra check: from what is being saved, else the
 * job as it stands, else what the customer chose online.
 */
export async function surveyMinutes({ surveyType = null, extras = null, jobId = null, leadId = null } = {}) {
  const j = jobId ? await query('select survey_type, extra_minutes, extras, lead_id from jobs where id = $1', [jobId]).then((r) => r[0]) : null;
  const l = !surveyType && !j && leadId ? await query('select survey_choice from leads where id = $1', [leadId]).then((r) => r[0]) : null;
  const choice = l && l.survey_choice ? (typeof l.survey_choice === 'string' ? JSON.parse(l.survey_choice) : l.survey_choice) : null;
  const type = surveyType || (j && j.survey_type) || (choice && choice.key) || null;
  const rate = type ? await query('select duration_min from job_rates where key = $1', [type]).then((r) => r[0]) : null;
  const base = (rate && Number(rate.duration_min)) || 60;
  const extra = Array.isArray(extras) ? extras.length * EXTRA_MINUTES
    : j ? Number(j.extra_minutes) || 0
    : choice && Array.isArray(choice.addOns) ? choice.addOns.length * EXTRA_MINUTES : 0;
  return base + extra;
}

export async function travelClash({ surveyor, site, date, time, postcode, exceptJob = null, minutes = null }) {
  if (!DAMP.includes(site) || !surveyor || !date || !time || String(date).slice(0, 10) < londonToday()) return null;
  const others = await query(`select to_char(job_time, 'HH24:MI') as time, customer_postcode as postcode, coalesce(customer_name, 'another survey') as name,
      coalesce((select r.duration_min from job_rates r where r.key = jobs.survey_type), 60) + coalesce(jobs.extra_minutes, 0) as minutes from jobs
      where surveyor = $1 and job_date = $2::date and date_set and status in ('booked', 'completed') and id is distinct from $3`, [surveyor, String(date).slice(0, 10), exceptJob]);
  if (!others.length) return null;
  const where = await places([postcode, ...others.map((o) => o.postcode)]);
  const own = minutes || await surveyMinutes({ jobId: exceptJob });
  const hit = blocker(String(time).slice(0, 5), postcode ? where.get(tidy(postcode)) : null, others, where, own);
  if (!hit) return null;
  const who = surveyor[0].toUpperCase() + surveyor.slice(1);
  return hit.why === 'untimed' ? `${who} already has ${hit.name} that day with no time set.`
    : `${who} has ${hit.name} at ${hit.time}${hit.postcode ? ' in ' + hit.postcode : ''}: with the survey and about ${hit.drive} minutes' drive, ${String(time).slice(0, 5)} does not fit. Send force to book it anyway.`;
}

/** Answers 400 with the reason and returns true when the time is refused. */
export async function refuseTravel(res, args) {
  if (args.force === true) return false;
  const clash = await travelClash(args);
  if (!clash) return false;
  json(res, 400, { ok: false, clash, error: clash });
  return true;
}
