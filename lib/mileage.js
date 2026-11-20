/**
 * Mileage for the directors (the owner, 20 Nov 2026: "add the mileage claim"):
 * the company may pay a director 45p a mile for business driving in their own
 * car (25p after 10,000 miles in a tax year), tax free and a cost to the
 * company. Worked out from the surveys they did: home to the first, between
 * each, and home again, the same days the route check draws
 * (lib/day-route.js). Miles are the straight line times 1.33 for the roads
 * (the factor lib/travel.js is tuned with), so a claim can be checked and
 * typed over before it is recorded. A claim is a cost on Money (category
 * Mileage, "Tom 2026-11: 412 miles"), so the bank check matches its transfer.
 */
import { query } from './db.js';
import { places, tidy } from './travel.js';
import { homeOf } from './homes.js';

export const DIRECTORS = ['scott', 'tom'];
export const RATE = 45, LATER_RATE = 25, BAND_MILES = 10000;
const DAMP = ['dampscan', 'ati-london'];
const NAME = { scott: 'Scott', tom: 'Tom' };

/** Road miles between two places: the straight line times 1.33. Pure. */
export function roadMiles(a, b) {
  if (!a || !b) return 0;
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.33 * 0.621371;
}

/** One day's driving: home, each survey in time order, home again. Pure over the places. */
export function dayMiles(home, stops) {
  const pts = [home, ...stops, home].filter(Boolean);
  let m = 0;
  for (let i = 1; i < pts.length; i += 1) m += roadMiles(pts[i - 1], pts[i]);
  return Math.round(m);
}

/** What a month's miles are worth, given the miles already claimed this tax year. Pure. */
export function claimPence(miles, before = 0) {
  const at45 = Math.max(0, Math.min(miles, BAND_MILES - before));
  return at45 * RATE + (miles - at45) * LATER_RATE;
}

/** The tax year (6 April to 5 April) a London day is in. */
export const taxYear = (day) => { const y = Number(day.slice(0, 4)); const from = day >= `${y}-04-06` ? y : y - 1; return { from: `${from}-04-06`, to: `${from + 1}-04-05`, label: `${from}/${String(from + 1).slice(2)}` }; };

/** Each director's driving month by month this tax year, what was claimed, and what is left to claim. */
export async function mileage(today) {
  const ty = taxYear(today);
  const [jobs, claimed] = await Promise.all([
    query(`select lower(surveyor) as who, job_date::text as day, job_time::text as time, customer_postcode as postcode from jobs
       where site = any($1::text[]) and lower(surveyor) = any($2::text[]) and status not in ('cancelled', 'declined', 'quoted') and date_set
         and job_date between $3::date and least($4::date, (now() at time zone 'Europe/London')::date)
       order by job_date, job_time nulls last, id`, [DAMP, DIRECTORS, ty.from, ty.to]),
    query("select what, amount_pence from expenses where removed_at is null and category = 'Mileage' and spent_on >= $1::date", [ty.from])
  ]);
  const where = await places(jobs.map((j) => j.postcode)).catch(() => new Map());
  return DIRECTORS.map((who) => {
    const home = homeOf(who);
    const months = new Map();
    const days = [...new Set(jobs.filter((j) => j.who === who).map((j) => j.day))];
    for (const day of days) {
      const stops = jobs.filter((j) => j.who === who && j.day === day).map((j) => where.get(tidy(j.postcode))).filter(Boolean);
      const miles = dayMiles(home, stops);
      const m = day.slice(0, 7), cur = months.get(m) || { month: m, miles: 0, days: 0 };
      cur.miles += miles; cur.days += 1; months.set(m, cur);
    }
    /* Claimed months are written "Tom 2026-11: 412 miles". */
    const mine = claimed.filter((c) => new RegExp(`^${NAME[who]} \\d{4}-\\d{2}:`).test(c.what || ''));
    const done = new Map(mine.map((c) => [c.what.slice(NAME[who].length + 1, NAME[who].length + 8), { pence: Number(c.amount_pence), miles: Number((/:\s*(\d+)/.exec(c.what) || [])[1]) || 0 }]));
    let before = [...done.values()].reduce((t, c) => t + c.miles, 0);
    const list = [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).map((m) => {
      if (done.has(m.month)) return { ...m, claimed: done.get(m.month) };
      const pence = claimPence(m.miles, before), was = before;
      before += m.miles;
      return { ...m, pence, before: was, open: m.month < today.slice(0, 7) };
    });
    const miles = list.reduce((t, m) => t + m.miles, 0);
    return { who, name: NAME[who], home: home ? home.area : null, taxYear: ty.label, miles, claimedPence: [...done.values()].reduce((t, c) => t + c.pence, 0),
      toClaim: list.filter((m) => !m.claimed && m.open), thisMonth: list.find((m) => m.month === today.slice(0, 7) && !m.claimed) || null, months: list };
  });
}
