/**
 * Best fit for an enquiry: the free times over the next fortnight that sit
 * closest to a surveyor's other surveys that day, so a Whitstable customer
 * is offered the day someone is already in Kent, not a day in North London.
 * Every option is a start inside that surveyor's own hours that leaves room
 * for the drive both ways (lib/travel.js). A day with nothing else on it is
 * still offered, after the ones with neighbours, since it costs a whole trip.
 * Also hands back each place's position, for the map.
 */
import { query } from './db.js';
import { listHours } from './availability.js';
import { pencilTimes } from './pencils.js';
import { places, blocker, driveMinutes, tidy, SURVEY_MIN } from './travel.js';

const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

export async function bestFits(cards, sites, today, { days = 14, keep = 3 } = {}) {
  const from = addDays(today, 1);
  const to = addDays(today, days);
  const [hours, jobs, held] = await Promise.all([
    listHours(null, from, to),
    query(`select surveyor, job_date::text as date, to_char(job_time, 'HH24:MI') as time, customer_postcode as postcode, coalesce(customer_name, 'a survey') as name
             from jobs where job_date between $1::date and $2::date and date_set and status in ('booked', 'completed') and surveyor is not null`, [from, to]),
    pencilTimes(sites, from, to)
  ]);
  const where = await places([...cards.map((c) => c.postcode), ...jobs.map((j) => j.postcode), ...held.map((p) => p.postcode)]);
  const out = new Map();
  for (const c of cards) {
    const here = where.get(tidy(c.postcode));
    const options = [];
    for (const h of hours) {
      const sameDay = jobs.filter((j) => j.surveyor === h.surveyor && j.date === h.date);
      const taken = [...sameDay, ...held.filter((p) => p.surveyor === h.surveyor && p.date === h.date)];
      /* The nearest survey that day: how close this customer is to work already planned. */
      let near = null;
      for (const j of sameDay) {
        const m = here && where.get(tidy(j.postcode)) ? driveMinutes(here, where.get(tidy(j.postcode))) : null;
        if (m != null && (!near || m < near.minutes)) near = { minutes: m, name: j.name, postcode: j.postcode, time: j.time };
      }
      for (let m = Math.ceil(toMin(h.start) / 30) * 30; m + SURVEY_MIN <= toMin(h.end); m += 30) {
        const time = fromMin(m);
        if (blocker(time, here, taken, where)) continue;
        options.push({ date: h.date, time, surveyor: h.surveyor, near, score: near ? near.minutes : 1000 + (Date.parse(h.date) / 86400000) });
        break;
      }
    }
    options.sort((a, b) => a.score - b.score || (a.date + a.time).localeCompare(b.date + b.time));
    /* One per surveyor per day, best first. */
    const seen = new Set();
    const best = options.filter((o) => { const k = o.date + o.surveyor; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, keep).map(({ score, ...o }) => o);
    out.set(c.kind + ':' + c.id, { at: here || null, best });
  }
  return { fits: out, where };
}
