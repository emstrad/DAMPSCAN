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

const DAMP = ['dampscan', 'ati-london'];

export async function travelClash({ surveyor, site, date, time, postcode, exceptJob = null }) {
  if (!DAMP.includes(site) || !surveyor || !date || !time || String(date).slice(0, 10) < londonToday()) return null;
  const others = await query(`select to_char(job_time, 'HH24:MI') as time, customer_postcode as postcode, coalesce(customer_name, 'another survey') as name from jobs
      where surveyor = $1 and job_date = $2::date and date_set and status in ('booked', 'completed') and id is distinct from $3`, [surveyor, String(date).slice(0, 10), exceptJob]);
  if (!others.length) return null;
  const where = await places([postcode, ...others.map((o) => o.postcode)]);
  const hit = blocker(String(time).slice(0, 5), postcode ? where.get(tidy(postcode)) : null, others, where);
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
