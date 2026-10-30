/**
 * The evening route check: each surveyor's day tomorrow, in order, with the
 * drive between surveys (from home, between each, and home again), sent to
 * their own feed. Anything that will not work is called out: a time too
 * tight for the drive and the survey before it, a hop over 75 minutes, a
 * survey with no time or no postcode, a survey outside the hours they set.
 * The owners hear only about those problems (their "Tomorrow" push is off by
 * their choice).
 */
import { query } from './db.js';
import { push } from './notify.js';
import { notify } from './notify.js';
import { listHours } from './hours-store.js';
import { places, driveMinutes, tidy, SURVEY_MIN } from './travel.js';
import { homeOf } from './homes.js';
import { topicFor } from './surveyor-alerts.js';
import { MAX_LEG_MIN } from './best-fit.js';
import { customer, staffBase } from './alert-words.js';

const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export async function routeCheck(date) {
  const jobs = await query(`select j.surveyor, to_char(j.job_time, 'HH24:MI') as time, j.customer_name as name, j.customer_postcode as postcode,
      coalesce(r.duration_min, 60) as minutes from jobs j left join job_rates r on r.key = j.survey_type
     where j.site in ('dampscan', 'ati-london') and j.job_date = $1::date and j.date_set and j.status in ('booked', 'completed') and j.surveyor is not null
     order by j.job_time nulls first`, [date]);
  const hours = await listHours(null, date, date);
  const where = await places(jobs.map((j) => j.postcode));
  const out = [];
  for (const who of [...new Set(jobs.map((j) => j.surveyor))]) {
    const mine = jobs.filter((j) => j.surveyor === who);
    const home = homeOf(who);
    const lines = [], problems = [];
    let prev = home ? { at: home, end: null, name: 'home' } : null;
    for (const j of mine) {
      const at = where.get(tidy(j.postcode));
      if (!j.time) { problems.push(`${customer(j.name, j.postcode)} has no time yet`); lines.push(`?? ${customer(j.name, j.postcode)}`); continue; }
      if (!at) problems.push(`${customer(j.name, j.postcode)}: postcode not found, drive not known`);
      const drive = prev && prev.at && at ? driveMinutes(prev.at, at) : null;
      if (drive != null) {
        lines.push(`${drive} min drive`);
        if (prev.end != null && drive > MAX_LEG_MIN) problems.push(`${drive} min drive to ${customer(j.name, j.postcode)} is over ${MAX_LEG_MIN}`);
        if (prev.end != null && prev.end + drive > toMin(j.time)) problems.push(`${j.time} ${customer(j.name, j.postcode)} is tight: earliest arrival about ${fromMin(prev.end + drive)}`);
      }
      if (!hours.some((h) => h.surveyor === who && toMin(j.time) >= toMin(h.start) && toMin(j.time) + Number(j.minutes || SURVEY_MIN) <= toMin(h.end))) problems.push(`${j.time} is outside the hours set`);
      lines.push(`${j.time} ${customer(j.name, j.postcode)}`);
      prev = { at, end: toMin(j.time) + Number(j.minutes || SURVEY_MIN), name: j.name };
    }
    if (home && prev && prev.at && prev.end != null) lines.push(`home about ${fromMin(prev.end + driveMinutes(prev.at, home))}`);
    const title = `Tomorrow: ${mine.length} survey${mine.length === 1 ? '' : 's'}${problems.length ? ', check ' + problems.length : ''}`;
    const message = (problems.length ? 'Check: ' + problems.join('; ') + '.\n' : '') + lines.join(' > ');
    /* Claimed first, so a second evening run (or a retry) never sends the day twice. */
    const fresh = await query('insert into route_sent (surveyor, day) values ($1, $2::date) on conflict do nothing returning surveyor', [who, date]);
    if (!fresh.length) { out.push({ surveyor: who, surveys: mine.length, problems, repeat: true }); continue; }
    const topic = topicFor(who);
    if (topic) await push({ topic, title, message, tags: problems.length ? 'warning' : 'world_map', priority: problems.length ? 4 : 3, click: staffBase() + '/day.html' });
    if (problems.length) await notify({ business: null, kind: 'diary', ref: null, tags: 'warning', priority: 4, path: '/schedule.html',
      title: `Route check: ${who[0].toUpperCase() + who.slice(1)} tomorrow`, message: problems.join('; ') + '.' });
    out.push({ surveyor: who, surveys: mine.length, problems });
  }
  return out;
}
