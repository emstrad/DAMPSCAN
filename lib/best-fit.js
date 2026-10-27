/**
 * The best times to offer a customer, worked out the way a good booker would,
 * so the person on the phone reads options out instead of working them out:
 *
 *   1. who is available: each surveyor's hours over the next fortnight
 *   2. who is already near: their booked surveys and holds that day
 *   3. where it fits their day best: the start that adds the least driving
 *      (from and back to their home area, lib/homes.js, at the ends of the day),
 *      snug after the survey before it, never making one drive longer than
 *      MAX_LEG_MIN, so nobody's day becomes two-hour hops
 *
 * Days with someone nearby come first, then days it still fits, then fresh
 * days with nothing booked (once one is booked, later customers nearby fit
 * round it). Several options, at most one per surveyor per day, each with
 * the reason in words. Positions come back too, for the map.
 */
import { query } from './db.js';
import { listHours } from './hours-store.js';
import { pencilTimes } from './pencils.js';
import { places, blocker, driveMinutes, tidy, SURVEY_MIN } from './travel.js';
import { homeOf } from './homes.js';

export const MAX_LEG_MIN = 75;
/* From home to the first survey, or back after the last, a longer run is fine. */
export const MAX_HOME_MIN = 120;
const NEAR_MIN = 40;
const STEP = 15;
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const place = (pc) => String(pc || '').trim().split(/\s+/)[0] || 'there';

/* The best start in one surveyor's day for this customer, or null. */
function bestInDay({ here, anchors, windows, where, home }) {
  const drive = (a, b) => (here && a && b ? driveMinutes(a, b) : null);
  let best = null;
  for (const w of windows) {
    for (let m = Math.ceil(toMin(w.start) / STEP) * STEP; m + SURVEY_MIN <= toMin(w.end); m += STEP) {
      const time = fromMin(m);
      if (blocker(time, here, anchors, where)) continue;
      const before = anchors.filter((a) => a.time && toMin(a.time) < m).sort((a, b) => toMin(b.time) - toMin(a.time))[0];
      const after = anchors.filter((a) => a.time && toMin(a.time) > m).sort((a, b) => toMin(a.time) - toMin(b.time))[0];
      const pa = before && where.get(tidy(before.postcode)), pn = after && where.get(tidy(after.postcode));
      /* No survey before or after: the drive is from or back to home, when known. */
      const inLeg = before ? drive(pa, here) : home ? drive(home, here) : 0;
      const outLeg = after ? drive(here, pn) : home ? drive(here, home) : 0;
      if ((inLeg ?? 0) > (before ? MAX_LEG_MIN : MAX_HOME_MIN) || (outLeg ?? 0) > (after ? MAX_LEG_MIN : MAX_HOME_MIN)) continue;
      const from0 = before ? pa : home, to0 = after ? pn : home;
      const added = (inLeg ?? 60) + (outLeg ?? (after ? 60 : 0)) - (from0 && to0 && (before || after) ? driveMinutes(from0, to0) : 0);
      /* Snug: little idle time between the survey before (plus the drive) and this one. */
      const idle = before ? m - (toMin(before.time) + SURVEY_MIN + (inLeg ?? 60)) : 0;
      const score = added + idle / 4;
      if (!best || score < best.score) best = { time, added: Math.max(0, added), score, before, after, inLeg, outLeg };
    }
  }
  return best;
}

export async function bestFits(cards, sites, today, { days = 14, keep = 5 } = {}) {
  const from = addDays(today, 1);
  const to = addDays(today, days);
  const [hours, jobs, held] = await Promise.all([
    listHours(null, from, to),
    query(`select surveyor, job_date::text as date, to_char(job_time, 'HH24:MI') as time, customer_postcode as postcode, coalesce(customer_name, 'a survey') as name
             from jobs where job_date between $1::date and $2::date and date_set and status in ('booked', 'completed') and surveyor is not null`, [from, to]),
    pencilTimes(sites, from, to)
  ]);
  const work = [...jobs, ...held.map((p) => ({ ...p, name: 'a hold' }))];
  const where = await places([...cards.map((c) => c.postcode), ...work.map((j) => j.postcode)]);
  const days2 = [...new Set(hours.map((h) => h.surveyor + '|' + h.date))];
  const out = new Map();
  for (const c of cards) {
    const here = where.get(tidy(c.postcode)) || null;
    const options = [];
    for (const key of days2) {
      const [surveyor, date] = key.split('|');
      const windows = hours.filter((h) => h.surveyor === surveyor && h.date === date);
      const anchors = work.filter((j) => j.surveyor === surveyor && j.date === date);
      const fit = bestInDay({ here, anchors, windows, where, home: homeOf(surveyor) });
      if (!fit) continue;
      const nearest = anchors.map((a) => ({ a, m: here && where.get(tidy(a.postcode)) ? driveMinutes(here, where.get(tidy(a.postcode))) : null }))
        .filter((x) => x.m != null).sort((x, y) => x.m - y.m)[0];
      const tier = !anchors.length ? 2 : nearest && nearest.m <= NEAR_MIN ? 0 : 1;
      const why = !here ? 'Postcode not found, so distance is not known'
        : tier === 2 ? `Fresh day for ${cap(surveyor)}, nothing else booked yet${homeOf(surveyor) && fit.inLeg != null ? `; about ${fit.inLeg} min from home (${homeOf(surveyor).area})` : ''}`
        : `${cap(surveyor)} is at ${nearest ? nearest.a.name + ' in ' + place(nearest.a.postcode) + ', ' + nearest.m + ' min away' : 'other surveys'} that day; adds about ${fit.added} min driving`;
      options.push({ date, time: fit.time, surveyor, tier, why, near: nearest && tier < 2 ? { minutes: nearest.m, name: nearest.a.name, postcode: nearest.a.postcode, time: nearest.a.time } : null,
        added: fit.added, score: tier * 1000 + fit.added + (Date.parse(date) - Date.parse(from)) / 86400000 * 2 });
    }
    options.sort((a, b) => a.score - b.score);
    /* Fresh days only fill what is left, at most two, so nearby work leads. */
    const near = options.filter((o) => o.tier < 2), fresh = options.filter((o) => o.tier === 2).slice(0, 2);
    const best = [...near, ...fresh].slice(0, keep).map(({ score, ...o }) => o);
    out.set(c.kind + ':' + c.id, { at: here, best });
  }
  return { fits: out, where };
}
