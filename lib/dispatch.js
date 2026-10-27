/**
 * The dispatch day for the Scheduling page: one lane per surveyor for a day,
 * the way a booking desk sees it. Each lane has the hours that surveyor set
 * (My hours), their surveys with the drive between them, the times pencilled
 * in, and the free starts left. Plus a week strip with each day's counts, so
 * a busy or empty day shows before it is opened.
 *
 * Staff see any day, tomorrow included: the two days' notice is the rule for
 * customers picking a time on the website, not for the person on the phone.
 */
import { query } from './db.js';
import { listHours } from './availability.js';
import { pencilsFor } from './pencils.js';
import { places, blocker, driveMinutes, tidy, SURVEY_MIN } from './travel.js';
import { SURVEYORS } from './splits.js';

const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/* Surveys on these days, with what the lane shows and the stage the card is at. */
async function surveysOn(sites, from, to) {
  return query(`select j.id, j.site, j.job_date::text as date, to_char(j.job_time, 'HH24:MI') as time, j.surveyor, j.status, j.awaiting_agent,
         coalesce(j.customer_name, l.first_name) as name, coalesce(j.customer_postcode, l.postcode) as postcode, r.label as survey_label,
         j.deposit_paid_at is not null as deposit, j.paid_at is not null as paid, j.survey_sent_at is not null as report_sent
    from jobs j left join leads l on l.id = j.lead_id left join job_rates r on r.key = j.survey_type
   where j.site = any($1::text[]) and j.job_date between $2::date and $3::date and j.date_set and j.status in ('booked', 'completed', 'paid')
   order by j.job_time nulls first`, [sites, from, to]);
}

/** The week strip: for each of seven days, surveys, holds and free starts. */
export async function week(sites, from) {
  const to = addDays(from, 6);
  const [jobs, hours, pencils] = await Promise.all([surveysOn(sites, from, to), listHours(null, from, to), pencilsFor(sites, from, to)]);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    return { date: d, surveys: jobs.filter((j) => j.date === d).length, pencilled: pencils.filter((p) => p.date === d).length,
      onHours: [...new Set(hours.filter((h) => h.date === d).map((h) => h.surveyor))] };
  });
}

/** One day, lane by lane. */
export async function day(sites, date) {
  const [jobs, hours, pencils] = await Promise.all([surveysOn(sites, date, date), listHours(null, date, date), pencilsFor(sites, date, date)]);
  const where = await places([...jobs, ...pencils].map((x) => x.postcode));
  const lanes = SURVEYORS.map((who) => {
    const mine = jobs.filter((j) => j.surveyor === who);
    const held = pencils.filter((p) => p.surveyor === who);
    const wins = hours.filter((h) => h.surveyor === who).map((h) => ({ start: h.start, end: h.end }));
    /* The drive from each timed survey to the next, as the board draws it. */
    const timed = mine.filter((j) => j.time).sort((a, b) => toMin(a.time) - toMin(b.time));
    const surveys = mine.map((j) => {
      const next = timed[timed.indexOf(j) + 1];
      const a = where.get(tidy(j.postcode)), b = next && where.get(tidy(next.postcode));
      return { id: Number(j.id), site: j.site, time: j.time, name: j.name, postcode: j.postcode, label: j.survey_label, status: j.status,
        awaitingAgent: j.awaiting_agent, deposit: j.deposit, paid: j.paid, reportSent: j.report_sent,
        driveNext: next ? { minutes: driveMinutes(a, b), known: Boolean(a && b), to: next.name } : null };
    });
    /* Free starts on the hour inside their windows, clear of surveys, the drive and holds. */
    const taken = [...mine.map((j) => ({ time: j.time, postcode: j.postcode, name: j.name })), ...held.map((p) => ({ time: p.time, postcode: p.postcode, name: p.customerName }))];
    const free = [];
    for (const w of wins) {
      for (let m = Math.ceil(toMin(w.start) / 60) * 60; m + SURVEY_MIN <= toMin(w.end); m += 60) {
        if (!blocker(fromMin(m), null, taken, where)) free.push(fromMin(m));
      }
    }
    return { surveyor: who, hours: wins, surveys, pencils: held, free };
  });
  /* A surveyor with nothing that day and no hours is left out, so the day reads as who is working. */
  return { date, lanes: lanes.filter((l) => l.hours.length || l.surveys.length || l.pencils.length) };
}
